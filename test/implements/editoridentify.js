const { AbstractEditorIdentify } = require('jstexteditactionstack');

class EditorIdentify extends AbstractEditorIdentify {
    constructor(name) {
        super();
        this.name = name;
    }

    equals(other) {
        return this.name === other;
    }
}

module.exports = EditorIdentify;