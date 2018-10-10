const mongoose = require('mongoose');

const GroupSchema = new mongoose.Schema({
	createDate: { type: Date, default: Date.now },
	locale: { type: String, default: 'en-EN' },
	telegramId: { type: String, unique: true },
	clan_tag: { type: String, unique: true, sparse: true },
	verification_code: String,
	warlog_to_group: Boolean,
	output_channel: String,
	output_channel_verification: { type: Object, default: {} },
	warlog_to_channel: Boolean,
	adminTGIds: Array(String),
	currentwar: {
		type: Object,
		default: { state: 'notInWar' }
	}
});

module.exports = mongoose.model('Group', GroupSchema);