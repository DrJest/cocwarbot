const mongoose = require('mongoose');

const UserSchema = new mongoose.Schema({
	createDate: { type: Date, default: Date.now },
	locale: { type: String, default: 'it-IT' },
	telegramId: { type: String, unique: true },
	telegramUsername: { type: String },
	tags: Array(String)
});

module.exports = mongoose.model('User', UserSchema);