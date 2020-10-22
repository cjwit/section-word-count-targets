// The module 'vscode' contains the VS Code extensibility API
// Import the necessary extensibility types to use in your code below
import { window, Disposable, ExtensionContext, StatusBarAlignment, StatusBarItem } from 'vscode';
import { resourceLimits } from 'worker_threads';

// This method is called when your extension is activated. Activation is
// controlled by the activation events defined in package.json.
export function activate(context: ExtensionContext) {

	// Use the console to output diagnostic information (console.log) and errors (console.error).
	// This line of code will only be executed once when your extension is activated.
	// console.log('Congratulations, your extension "Test" is now active!');

	// create a new word counter
	let wordCounter = new WordCounter();
	let controller = new WordCounterController(wordCounter);

	// Add to a list of disposables which are disposed when this extension is deactivated.
	context.subscriptions.push(controller);
	context.subscriptions.push(wordCounter);
}

class WordCounter {
	private statusMessage: StatusBarItem;
	private targets: any[] = [];

	constructor() {
		// Create as needed 
		this.statusMessage = window.createStatusBarItem(StatusBarAlignment.Left);
	}

	public updateTargetCount() {
		this.statusMessage.hide();

		// Get the current text editor 
		let editor = window.activeTextEditor;
		if (!editor) {
			return;
		}

		// Only update status if file is in markdown 
		let document = editor.document;
		if (document.languageId !== "markdown") {
			return;
		}

		// get lines and populate target data
		let documentLines: string[] = document.getText().split('\n');
		this.targets = this.getTargets(documentLines);
		
		// get section word count
		let selectionText: string = this.getSelectionText(editor.selection.start.line, documentLines);
		let wordCount: number = 0;
		if (selectionText !== "") {
			wordCount = this.getWordCount(selectionText);
		}

		// calculate completion percentages and update the status bar
		let currentTarget = this.getCurrentTarget(editor.selection.start.line);
		if (wordCount > 0 && currentTarget > 0) {
			this.showMessage(wordCount, currentTarget);
		}
	}

	private getSelectionText(lineNumber: number, documentLines: string[]) {
		let lastHeaderLine: number = this.findPreviousHeaderLine(lineNumber);
		let nextHeaderLine: number = this.findNextHeaderLine(lineNumber);

		// prepare text string by removing target info from the word count
		let sectionTextLines: string[] = documentLines.slice(lastHeaderLine, nextHeaderLine - 1);
		let result: string = sectionTextLines.join(' ');
		result = result.replace(/\(Target:\s[0-9]+\)/, '');
		
		return result;
	}

	private getCurrentTarget(lineNumber: number) {		
		let lastHeaderLine: number = this.findPreviousHeaderLine(lineNumber);
		if (lastHeaderLine < 0) { return -1; }
		let lastHeaderTarget: number = -1;

		if (this.targets[lastHeaderLine].hasTarget) {
			lastHeaderTarget = this.targets[lastHeaderLine].target;
		}

		return lastHeaderTarget;
	}

	private showMessage(wordCount: number, target: number) {
		let percentComplete: number = Math.round(wordCount * 100 / target);
		this.statusMessage.text = `$(pencil) Section progress: ${percentComplete}% of ${target}`;
		this.statusMessage.show();
	}

	private getTargets(documentLines: string[]) {
		let targets: any[] = []
		documentLines.forEach(line => {
			let targetData = {
				isHeader: false,
				hasTarget: false,
				target: -1
			};

			// add header and target data to the object
			targetData.isHeader = line.search(/^#+\s/) != -1 ? true : false;
			if (targetData.isHeader) {

				// determine whether there is a target
				if (line.search(/\(Target:\s[0-9]+\)$/) !== -1) {
					targetData.hasTarget = true;
				}

				// get target
				if (targetData.hasTarget) {
					let targetString = line.substring(line.search(/[0-9]+\)$/), line.length - 1);
					targetData.target = Number(targetString);
				}
			}
			targets.push(targetData)
		});

		return targets;
	}

	private findNextHeaderLine(currentLine: number) {
		let nextHeaderLine: number = currentLine;
		let nextHeaderFound: boolean = false;
		while (!nextHeaderFound && nextHeaderLine < this.targets.length) {
			if (this.targets[nextHeaderLine].isHeader) {
				nextHeaderFound = true;
			}
			nextHeaderLine++;
		}
		return nextHeaderLine;
	}

	private findPreviousHeaderLine(currentLine: number) {
		let previousHeaderLine: number = -1;
		while (currentLine >= 0 && previousHeaderLine < 0) {
			if (this.targets[currentLine].isHeader) {
				previousHeaderLine = currentLine;
			}
			currentLine--;
		}
		return previousHeaderLine;
	}

	private getWordCount(textString: string): number {

		// Parse out unwanted whitespace so the split is accurate 
		textString = textString.replace(/(< ([^>]+)<)/g, '').replace(/\s+/g, ' ');
		textString = textString.replace(/^\s\s*/, '').replace(/\s\s*$/, '');

		let wordCount = 0;
		if (textString != "") {
			wordCount = textString.split(" ").length;
		}

		return wordCount;
	}

	dispose() {
		this.statusMessage.dispose();
	}
}

class WordCounterController {

	private _wordCounter: WordCounter;
	private _disposable: Disposable;

	constructor(wordCounter: WordCounter) {
		this._wordCounter = wordCounter;
		this._wordCounter.updateTargetCount();

		// subscribe to selection change and editor activation events
		let subscriptions: Disposable[] = [];
		window.onDidChangeTextEditorSelection(this._onEvent, this, subscriptions);
		window.onDidChangeActiveTextEditor(this._onEvent, this, subscriptions);

		// update the counter for the current file
		this._wordCounter.updateTargetCount();

		// create a combined disposable from both event subscriptions
		this._disposable = Disposable.from(...subscriptions);
	}

	dispose() {
		this._disposable.dispose();
	}

	private _onEvent() {
		this._wordCounter.updateTargetCount();
	}
}
