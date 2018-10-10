'use strict';

process.env.NTBA_FIX_319 = 1;

const TelegramBot = require('node-telegram-bot-api');
const Request = require('request');
const Mongoose = require('mongoose');
const Path = require('path');
const Crypto = require('crypto');

const Config = require( __dirname + '/config.json' );

const Lang = require( __dirname + '/lang' );
const COCBot = require( __dirname + '/cocbot' );
const COCMonitor = require( __dirname + '/cocmonitor' );

const bot = new TelegramBot(Config.Bot.Token, Config.Bot.Config);
bot.setWebHook(`${Config.Bot.webHookUrl}/bot${Config.Bot.Token}`);

const lang = new Lang( __dirname + '/locales/' );

Mongoose.connect(Config.db.uri, { useNewUrlParser: true });

const COCRequest = Request.defaults({
  auth: {
    'bearer': Config.COCToken
  },
  baseUrl: 'https://api.clashofclans.com/v1/',
  json: true
});

bot.on('error', console.log);

let cocbot = new COCBot(bot, COCRequest);
let cocmonitor = new COCMonitor(bot, COCRequest).startWatch();