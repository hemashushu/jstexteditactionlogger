const assert = require('assert/strict');

const EditorIdentify = require('./implements/editoridentify');

const { ObjectUtils } = require('jsobjectutils');
const { TextSelection } = require('jstextselection');
const { TextChange, ChangeType,TextDiffPatch } = require('jstextdiffpatch');
const {TextEditAction} = require('jstexteditactionstack');

const { TextEditActionLogItem,
    TextEditActionLogger } = require('../index');

describe('TextEditActionLogger Test', () => {
    it('Test add()', () => {
        let editor1 = new EditorIdentify('foo');
        let logger1 = new TextEditActionLogger(editor1);

        let selection1 = new TextSelection(0);
        let selection2 = new TextSelection(2);

        let changes1 = TextDiffPatch.diff('', 'ab');
        let action1 = new TextEditAction(editor1, selection1, selection2, changes1);

        logger1.add(action1);

        let logItems1 = logger1.textEditActionLogItems;
        assert.equal(1, logItems1.length);

        let logItem1 = logItems1[0];
        assert(logItem1.creationTime > 0);
        assert(ObjectUtils.objectEquals(logItem1.textEditAction,
            new TextEditAction(
                editor1, new TextSelection(0), new TextSelection(2),
                [new TextChange(0, ChangeType.added, 'ab')]
            )));

        // TODO::
    });

});