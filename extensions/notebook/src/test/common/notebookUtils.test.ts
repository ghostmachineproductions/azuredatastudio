/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the Source EULA. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as azdata from 'azdata';
import { NotebookUtils } from '../../common/notebookUtils';
import * as should from 'should';
import * as vscode from 'vscode';
import * as TypeMoq from 'typemoq';
import * as os from 'os';
import * as path from 'path';
import * as uuid from 'uuid';
import { promises as fs } from 'fs';
import { ApiWrapper } from '../../common/apiWrapper';
import { tryDeleteFile } from './testUtils';
import { CellTypes } from '../../contracts/content';

describe('notebookUtils Tests', function (): void {
	let notebookUtils: NotebookUtils;
	let apiWrapperMock: TypeMoq.IMock<ApiWrapper>;

	beforeEach(function (): void {
		apiWrapperMock = TypeMoq.Mock.ofInstance(new ApiWrapper());
		notebookUtils = new NotebookUtils(apiWrapperMock.object);
	});

	this.afterAll(async function (): Promise<void> {
		await vscode.commands.executeCommand('workbench.action.closeAllEditors');
	});

	describe('newNotebook', function (): void {
		it('Should open a new notebook successfully', async function (): Promise<void> {
			should(azdata.nb.notebookDocuments.length).equal(0, 'There should be not any open Notebook documents');
			await notebookUtils.newNotebook(undefined);
			should(azdata.nb.notebookDocuments.length).equal(1, 'There should be exactly 1 open Notebook document');
			await vscode.commands.executeCommand('workbench.action.closeActiveEditor');
			should(azdata.nb.notebookDocuments.length).equal(0, 'There should be not any open Notebook documents');
		});

		it('Opening an untitled editor after closing should re-use previous untitled name', async function (): Promise<void> {
			should(azdata.nb.notebookDocuments.length).equal(0, 'There should be not any open Notebook documents');
			await notebookUtils.newNotebook(undefined);
			should(azdata.nb.notebookDocuments.length).equal(1, 'There should be exactly 1 open Notebook document');
			should(azdata.nb.notebookDocuments[0].fileName).equal('Notebook-0', 'The first Untitled Notebook should have an index of 0');
			await vscode.commands.executeCommand('workbench.action.closeActiveEditor');
			should(azdata.nb.notebookDocuments.length).equal(0, 'There should be not any open Notebook documents');
			await notebookUtils.newNotebook(undefined);
			should(azdata.nb.notebookDocuments.length).equal(1, 'There should be exactly 1 open Notebook document after second opening');
			should(azdata.nb.notebookDocuments[0].fileName).equal('Notebook-0', 'The first Untitled Notebook should have an index of 0 after closing first Untitled Notebook');
			await vscode.commands.executeCommand('workbench.action.closeActiveEditor');
		});

		it('Untitled Name index should increase', async function (): Promise<void> {
			should(azdata.nb.notebookDocuments.length).equal(0, 'There should be not any open Notebook documents');
			await notebookUtils.newNotebook(undefined);
			should(azdata.nb.notebookDocuments.length).equal(1, 'There should be exactly 1 open Notebook document');
			const secondNotebook = await notebookUtils.newNotebook(undefined);
			should(azdata.nb.notebookDocuments.length).equal(2, 'There should be exactly 2 open Notebook documents');
			should(secondNotebook.document.fileName).equal('Notebook-1', 'The second Untitled Notebook should have an index of 1');
			await vscode.commands.executeCommand('workbench.action.closeActiveEditor');
			await vscode.commands.executeCommand('workbench.action.closeActiveEditor');
			should(azdata.nb.notebookDocuments.length).equal(0, 'There should be not any open Notebook documents');
		});
	});

	describe('openNotebook', function () {
		it('opens a Notebook successfully', async function (): Promise<void> {
			const notebookPath = path.join(os.tmpdir(), `OpenNotebookTest_${uuid.v4()}.ipynb`);
			const notebookUri = vscode.Uri.file(notebookPath);
			try {
				await fs.writeFile(notebookPath, '');
				apiWrapperMock.setup(x => x.showOpenDialog(TypeMoq.It.isAny())).returns(() => Promise.resolve([notebookUri]));
				await notebookUtils.openNotebook();
				should(azdata.nb.notebookDocuments.find(doc => doc.fileName === notebookUri.fsPath)).not.be.undefined();
				await vscode.commands.executeCommand('workbench.action.closeActiveEditor');
			} finally {
				tryDeleteFile(notebookPath);
			}
		});

		it('shows error if unexpected error is thrown', async function (): Promise<void> {
			apiWrapperMock.setup(x => x.showOpenDialog(TypeMoq.It.isAny())).throws(new Error('Unexpected error'));
			apiWrapperMock.setup(x => x.showErrorMessage(TypeMoq.It.isAny())).returns(() => Promise.resolve(''));
			await notebookUtils.openNotebook();
			apiWrapperMock.verify(x => x.showErrorMessage(TypeMoq.It.isAny()), TypeMoq.Times.once());
		});
	});

	describe('runActiveCell', function () {
		it('shows error when no notebook visible', async function (): Promise<void> {
			apiWrapperMock.setup(x => x.getActiveNotebookEditor()).returns(() => undefined);
			await notebookUtils.runActiveCell();
			apiWrapperMock.verify(x => x.showErrorMessage(TypeMoq.It.isAny()), TypeMoq.Times.once());
		});

		it('does not show error when notebook visible', async function (): Promise<void> {
			let mockNotebookEditor = TypeMoq.Mock.ofType<azdata.nb.NotebookEditor>();
			apiWrapperMock.setup(x => x.getActiveNotebookEditor()).returns(() => mockNotebookEditor.object);
			await notebookUtils.runActiveCell();
			apiWrapperMock.verify(x => x.showErrorMessage(TypeMoq.It.isAny()), TypeMoq.Times.never());
			mockNotebookEditor.verify(x => x.runCell(TypeMoq.It.isAny()), TypeMoq.Times.once());
		});
	});

	describe('clearActiveCellOutput', function () {
		it('shows error when no notebook visible', async function (): Promise<void> {
			apiWrapperMock.setup(x => x.getActiveNotebookEditor()).returns(() => undefined);
			await notebookUtils.clearActiveCellOutput();
			apiWrapperMock.verify(x => x.showErrorMessage(TypeMoq.It.isAny()), TypeMoq.Times.once());
		});

		it('does not show error when notebook visible', async function (): Promise<void> {
			let mockNotebookEditor = TypeMoq.Mock.ofType<azdata.nb.NotebookEditor>();
			apiWrapperMock.setup(x => x.getActiveNotebookEditor()).returns(() => mockNotebookEditor.object);
			await notebookUtils.clearActiveCellOutput();
			apiWrapperMock.verify(x => x.showErrorMessage(TypeMoq.It.isAny()), TypeMoq.Times.never());
			mockNotebookEditor.verify(x => x.clearOutput(TypeMoq.It.isAny()), TypeMoq.Times.once());
		});
	});

	describe('runAllCells', function () {
		it('shows error when no notebook visible', async function (): Promise<void> {
			apiWrapperMock.setup(x => x.getActiveNotebookEditor()).returns(() => undefined);
			await notebookUtils.runAllCells();
			apiWrapperMock.verify(x => x.showErrorMessage(TypeMoq.It.isAny()), TypeMoq.Times.once());
		});

		it('does not show error when notebook visible', async function (): Promise<void> {
			let mockNotebookEditor = TypeMoq.Mock.ofType<azdata.nb.NotebookEditor>();
			apiWrapperMock.setup(x => x.getActiveNotebookEditor()).returns(() => mockNotebookEditor.object);
			await notebookUtils.runAllCells();
			apiWrapperMock.verify(x => x.showErrorMessage(TypeMoq.It.isAny()), TypeMoq.Times.never());
			mockNotebookEditor.verify(x => x.runAllCells(TypeMoq.It.isAny(), TypeMoq.It.isAny()), TypeMoq.Times.once());
		});
	});

	describe('addCell', function () {
		it('shows error when no notebook visible for code cell', async function (): Promise<void> {
			apiWrapperMock.setup(x => x.getActiveNotebookEditor()).returns(() => undefined);
			await notebookUtils.addCell('code');
			apiWrapperMock.verify(x => x.showErrorMessage(TypeMoq.It.isAny()), TypeMoq.Times.once());
		});

		it('shows error when no notebook visible for markdown cell', async function (): Promise<void> {
			apiWrapperMock.setup(x => x.getActiveNotebookEditor()).returns(() => undefined);
			await notebookUtils.addCell('markdown');
			apiWrapperMock.verify(x => x.showErrorMessage(TypeMoq.It.isAny()), TypeMoq.Times.once());
		});

		it('does not show error when notebook visible for code cell', async function (): Promise<void> {
			const notebookEditor = await notebookUtils.newNotebook(undefined);
			apiWrapperMock.setup(x => x.getActiveNotebookEditor()).returns(() => notebookEditor);
			await notebookUtils.addCell('code');
			apiWrapperMock.verify(x => x.showErrorMessage(TypeMoq.It.isAny()), TypeMoq.Times.never());
			should(notebookEditor.document.cells.length).equal(1);
			should(notebookEditor.document.cells[0].contents.cell_type).equal(CellTypes.Code);
		});

		it('does not show error when notebook visible for markdown cell', async function (): Promise<void> {
			const notebookEditor = await notebookUtils.newNotebook(undefined);
			apiWrapperMock.setup(x => x.getActiveNotebookEditor()).returns(() => notebookEditor);
			await notebookUtils.addCell('markdown');
			apiWrapperMock.verify(x => x.showErrorMessage(TypeMoq.It.isAny()), TypeMoq.Times.never());
			should(notebookEditor.document.cells.length).equal(1);
			should(notebookEditor.document.cells[0].contents.cell_type).equal(CellTypes.Markdown);
		});
	});

	describe('analyzeNotebook', function () {
		it('creates cell when oeContext exists', async function (): Promise<void> {
			const notebookEditor = await notebookUtils.newNotebook(undefined);
			apiWrapperMock.setup(x => x.getActiveNotebookEditor()).returns(() => notebookEditor);
			apiWrapperMock.setup(x => x.showNotebookDocument(TypeMoq.It.isAny(), TypeMoq.It.isAny())).returns(() => Promise.resolve(notebookEditor));
			const oeContext: azdata.ObjectExplorerContext = {
				connectionProfile: undefined,
				isConnectionNode: true,
				nodeInfo: {
					nodePath: 'path/HDFS/path2',
					errorMessage: undefined,
					isLeaf: false,
					label: 'fakeLabel',
					metadata: undefined,
					nodeStatus: undefined,
					nodeSubType: undefined,
					nodeType: undefined
				}
			}
			await notebookUtils.analyzeNotebook(oeContext);
			should(notebookEditor.document.cells.length).equal(1, 'One cell should exist');
			should(notebookEditor.document.cells[0].contents.cell_type).equal(CellTypes.Code, 'Cell was created with incorrect type');
		});

		it('does not create new cell when oeContext does not exist', async function (): Promise<void> {
			const notebookEditor = await notebookUtils.newNotebook(undefined);
			apiWrapperMock.setup(x => x.getActiveNotebookEditor()).returns(() => notebookEditor);
			apiWrapperMock.setup(x => x.showNotebookDocument(TypeMoq.It.isAny(), TypeMoq.It.isAny())).returns(() => Promise.resolve(notebookEditor));
			await notebookUtils.analyzeNotebook();
			should(notebookEditor.document.cells.length).equal(0, 'No cells should exist');
		});
	});
});
