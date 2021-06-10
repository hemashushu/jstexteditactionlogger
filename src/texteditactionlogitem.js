/**
 * 文本编辑操作日志条目
 */
class TextEditActionLogItem {
	constructor(creationTime, textEditAction) {

		// the action item creation timestamp, it's the the number of
		// milliseconds since 1 January, 1970, 00:00:00, UTC.
        // 使用 Date.now() 方法即可获得当前时间戳
		this.creationTime = creationTime;

		this.textEditAction = textEditAction;
	}
}

module.exports = TextEditActionLogItem;