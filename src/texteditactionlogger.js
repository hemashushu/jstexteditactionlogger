const { TextDiffPatch, TextChange, ChangeType } = require('jstextdiffpatch');
const { IllegalArgumentException } = require('jsexception');
const { TextEditAction } = require('jstexteditactionstack');
const { TextSelection } = require('jstextselection');

const TextEditActionLogItem = require('./texteditactionlogitem');

/**
 * 文本编辑操作日志
 */
class TextEditActionLogger {
    constructor() {
        this.clear('');
    }

    /**
     * 重置
     * @param {*} textContent
     */
    clear(textContent) {
        this.textContent = textContent;
        this.textEditActionLogItems = [];
    }

    /**
     * 添加一项编辑操作
     *
     * @param {*} textEditAction
     */
    add(textEditAction) {
        if (textEditAction === undefined || textEditAction === null) {
            throw new IllegalArgumentException('The textEditAction parameter cannot be undefined or null..');
        }

        let { editorIdentify,
            textChanges,
            selectionBefore,
            selectionAfter } = textEditAction;

        // 跟 JSTextEditActionStack 的 pushIntoUndoStack 方法类似，这里
        // 也会合并简单的编辑操作以减少记录的数量以及改善重放的体验，详细的说明
        // 请见 JSTextEditActionStack 的 pushIntoUndoStack 方法

        let lastTextEditAction;
        if (this.textEditActionLogItems.length > 0) {
            let lastTextEditActionLogItem = this.textEditActionLogItems[this.textEditActionLogItems.length - 1];
            lastTextEditAction = lastTextEditActionLogItem.textEditAction;
        }

        if (this.textEditActionLogItems.length === 0 || // 日志为空，即没有上一次操作记录
            textChanges.length > 1 || // 当前改变的不止一处
            selectionAfter.start !== selectionAfter.end || // 光标不是折叠的，不是用户手工录入操作
            !editorIdentify.equals(lastTextEditAction.editorIdentify)) { // 不是同一个编辑器的操作

            let textEditActionLogItem = TextEditActionLogger.buildTextEditActionLogItem(textEditAction);
            this.textEditActionLogItems.push(textEditActionLogItem);
            return;
        }

        // 以下准备构建新的编辑操作（TextEditAction），并替换 textEditActionLogItems
        // 的最后一项。

        // 合并后的 TextChange 数组
        let combinedTextChanges;

        let lastTextChanges = lastTextEditAction.textChanges;
        let lastTextChange = lastTextChanges[lastTextChanges.length - 1];
        let currentTextChange = textChanges[0];

        if (/^\n+$/.test(currentTextChange.text) ||
            /^\n+$/.test(lastTextChange.text)) {
            // 不合并换行符，以免因为合并而导致 redo 时出错
            combinedTextChanges = [currentTextChange]

        } else if (
            lastTextChange.changeType === ChangeType.added &&
            currentTextChange.changeType === ChangeType.added) {

            // 检查是否简单的“添加文本”操作

            if (currentTextChange.position === lastTextChange.position + lastTextChange.text.length) {
                let combinedTextChange = new TextChange(
                    lastTextChange.position, ChangeType.added,
                    lastTextChange.text + currentTextChange.text);

                // 复制 lastTextChanges 除了最后一项之外的所有项目
                combinedTextChanges = lastTextChanges.slice(0, lastTextChanges.length - 1);
                combinedTextChanges.push(combinedTextChange);

                selectionBefore = lastTextEditAction.selectionBefore; // 将光标往后（上一次）扩展
                this.textEditActionLogItems.pop(); // 弹出最后一次编辑操作，准备压入新的编辑操作

            } else {
                combinedTextChanges = [currentTextChange]
            }

        } else if (
            lastTextChange.changeType === ChangeType.removed &&
            currentTextChange.changeType === ChangeType.removed) {

            // 检查是否简单的“删除文本”操作

            if (currentTextChange.position === lastTextChange.position) {
                // 用户按了 'delete' 键
                let combineTextChange = new TextChange(
                    lastTextChange.position,
                    ChangeType.removed,
                    lastTextChange.text + currentTextChange.text);

                // 复制 lastTextChanges 除了最后一项之外的所有项目
                combinedTextChanges = lastTextChanges.slice(0, lastTextChanges.length - 1);
                combinedTextChanges.push(combineTextChange);

                selectionBefore = lastTextEditAction.selectionBefore; // 将光标往后（上一次）扩展
                this.textEditActionLogItems.pop(); // 弹出最后一次编辑操作，准备压入新的编辑操作

            } else if (
                // selectionAfter.start === lastTextEditAction.selectionAfter.start - currentTextChange.text.length) {
                currentTextChange.position === lastTextChange.position - currentTextChange.text.length) {
                // 用户按了 'backspace' 键
                let combinedTextChange = new TextChange(
                    currentTextChange.position,
                    ChangeType.removed,
                    currentTextChange.text + lastTextChange.text); // this time removing + the previous removing.

                // 复制 lastTextChanges 除了最后一项之外的所有项目
                combinedTextChanges = lastTextChanges.slice(0, lastTextChanges.length - 1);
                combinedTextChanges.push(combinedTextChange);

                selectionBefore = lastTextEditAction.selectionBefore; // 将光标往后（上一次）扩展
                this.textEditActionLogItems.pop(); // 弹出最后一次编辑操作，准备压入新的编辑操作

            } else {
                // 没法合并，保持 TextChange 数组不变
                combinedTextChanges = [currentTextChange];
            }

        } else {
            // 没法合并，保持 TextChange 数组不变
            combinedTextChanges = [currentTextChange];
        }

        // 重组 TextEditAction
        let combinedTextEditAction = new TextEditAction(
            editorIdentify,
            selectionBefore, selectionAfter, combinedTextChanges);

        let combineActionLogItem = TextEditActionLogger.buildTextEditActionLogItem(combinedTextEditAction);
        this.textEditActionLogItems.push(combineActionLogItem);
    }

    /**
     * 检查文本编辑操作日志的完整性
     *
     * - 如果原文本经过文本编辑操作日志计算后跟最新文本不一致，则返回两者
     *   之间的“空隙编辑操作”（Gap TextEditAction）。
     * - 如果文本一致，则返回 undefined
     *
     * @param {*} textContentBeforeLog 开始日志记录时候的文本（原文本）
     * @param {*} textEditActionLogItems 日志记录
     * @param {*} textContentAfterLog 日志记录之后的文本（当前文本）
     * @param {*} gapEditorIdentify 空白的编辑器识别值，用于生成“空隙编辑操作”（Gap TextEditAction）
     * @returns 返回空隙编辑操作信息（Gap TextEditAction）
     */
    static checkTextEditActionLogIntegrity(textContentBeforeLog, textEditActionLogItems, textContentAfterLog, gapEditorIdentify) {
        // 根据原文本和日志演算最新版本的文本内容
        let textContent = textContentBeforeLog;
        for (let textEditActionLogItem of textEditActionLogItems) {
            let textEditAction = textEditActionLogItem.textEditAction;
            let textChanges = textEditAction.textChanges;
            textContent = TextDiffPatch.apply(textContent, textChanges);
        }

        // 现在 textContent 是根据日志演算出来的（历史上）的最新版本的文本
        return TextEditActionLogger.getTextEditActionByModifiedText(textContent, textContentAfterLog, gapEditorIdentify);
    }

    /**
     * 计算新旧两个版本的文本内容所需要的编辑操作
     *
     * @param {*} originalTextContent 原文本内容
     * @param {*} modifiedTextContent 发生改变后的文本内容
     * @param {*} editorIdentify 编辑器识别值，用于生成编辑操作信息（TextEditAction）。
     *     一般来说，调用该方法的是在后端（backend）更新文本内容的过程，这些过程并不是由编辑器
     *     触发的，所以只需传入一个空白的编辑器识别值即可。
     * @returns 返回编辑操作信息（TextEditAction），如果
     *     文本内容未发生改变，则返回 undefined.
     */
    static getTextEditActionByModifiedText(originalTextContent, modifiedTextContent, editorIdentify) {
        if (originalTextContent === modifiedTextContent) {
            return; // 文本内容未改变，返回 undefined
        }

        let textChanges = TextDiffPatch.diff(originalTextContent, modifiedTextContent);

        let firstTextChange = textChanges[0];
        let firstPosition = firstTextChange.position;
        let selectionBefore = new TextSelection(firstPosition);

        let lastTextChange = textChanges[textChanges.length - 1];
        let lastPosition = (lastTextChange.changeType === ChangeType.removed) ?
            lastTextChange.position : lastTextChange.position + lastTextChange.text.length;

        let selectionAfter = new TextSelection(lastPosition);

        return new TextEditAction(
            editorIdentify,
            selectionBefore, selectionAfter,
            textChanges);
    }

    static buildTextEditActionLogItem(textEditAction) {
        if (textEditAction === undefined || textEditAction === null) {
            throw new IllegalArgumentException('The textEditAction parameter cannot be undefined or null..');
        }

        let textEditActionLogItem = new TextEditActionLogItem(Date.now(), textEditAction);
        return textEditActionLogItem;
    }

    /**
     * 反转文本编辑操作
     *
     * 在保存编辑器的文本（即最新版本的文本）时，如果磁盘上的文本版本没有通过一致性检测，
     * 通常是因为文本内容被其他应用程序修改并保存了，则
     *
     * 1. 先通过 checkTextEditActionLogIntegrity 获得“空隙编辑操作”信息
     *    填充 textEditActionLogItems 以让日志记录能演算出磁盘上的版本。
     * 2. 再使用 reverseTextEditAction 方法获得反向“空隙编辑操作”信息，并
     *    添加到 textEditActionLogItems 以让日志记录能演算出文本在被外部应用
     *    程序修改之前的版本（也就是本应该通过一致性检查的版本）
     * 3. 因为编辑器的编辑记录是建立在文本在被外部应用程序修改之前的版本的基础
     *    之上，所以第 2 步是有必要的。
     *
     * 也就是说，为了**让外部应用程序所修改的文本版本也能记录在文件的历史版本里**，需要
     * 先填充一些空隙编辑操作信息，然后再填充反向空隙编辑操作信息，然后再保存新的
     * 编辑操作日志（textEditActionLogItems）及最新的文本版本。
     *
     * @param {*} textEditAction
     * @returns
     */
    static reverseTextEditAction(textEditAction) {
        return new TextEditAction(
            textEditAction.editorIdentify,
            textEditAction.selectionAfter,
            textEditAction.selectionBefore,
            TextDiffPatch.reverse(textEditAction.textChanges));
    }
}

module.exports = TextEditActionLogger;