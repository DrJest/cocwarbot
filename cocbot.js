const Path = require('path');
const Crypto = require('crypto');
const Lang = require( __dirname + '/lang' );
const Async = require('async');
const emoji = require('node-emoji');
const moment = require('moment');

const User  = require( Path.join( __dirname, 'model',  'user' ) );
const Group = require( Path.join( __dirname, 'model', 'group' ) );

module.exports = function(bot, request) {
  let lang = new Lang( __dirname + '/locales/' );
  
  const isGroupChat = msg => msg.from.id !== msg.chat.id;

  const getUser = msg => {
    return User.findOne( { telegramId: msg.from.id } ).exec().then( u => {
      if( u === null ) {
        return User.create({ telegramId: msg.from.id, telegramUsername: msg.from.username || msg.from.first_name, locale: msg.from.language_code }).then( usr => {
          return Promise.resolve( usr );
        } )
      }
      return Promise.resolve( u );
    } );
  };

  const getGroup = msg => {
    return Group.findOne( { telegramId: msg.chat.id } ).exec().then( g => {
      if( g === null ) {
        return Group.create({ telegramId: msg.chat.id, locale: msg.from.language_code }).then( grp => {
          return Promise.resolve( grp );
        } )
      }
      return Promise.resolve( g );
    } );
  };

  const getRemainingAttacksAndStars = war => {
    war.oppn = war.opponent;
    let remainingAttacks = [];
    let remainingStars = [];
    let tagsToCheck = [];
    for( let m of war.clan.members ) {
      let a = m.attacks ? 2 - m.attacks.length : 2;
      if(a) {
        remainingAttacks.push({
          tag: m.tag,
          name: m.name,
          mapPosition: m.mapPosition,
          attacks: a
        });
        tagsToCheck.push(m.tag);
      }
    }
    remainingAttacks.sort((a,b) => a.mapPosition - b.mapPosition);
    for( let m of war.oppn.members ) {
      let s = 3;
      if( m.bestOpponentAttack ) {
        s = 3 - m.bestOpponentAttack.stars;
      }
      if(s) {
        remainingStars.push({
          tag: m.tag,
          name: m.name,
          mapPosition: m.mapPosition,
          stars: s
        });
        tagsToCheck.push(m.tag);
      }
    }
    remainingStars.sort((a,b) => a.mapPosition - b.mapPosition);
    return new Promise((resolve, reject) => {
      Async.mapLimit(tagsToCheck, 10, (t, next) => {
        request.get( '/players/' + encodeURIComponent(t), (err, resp, user) => {
          for(let m of remainingAttacks) {
            if(m.tag === t) {
              m.townHallLevel = user.townHallLevel;
            }
          }
          for(let m of remainingStars) {
            if(m.tag === t) {
              m.townHallLevel = user.townHallLevel;
            }
          }
          return next(err, t);
        });
      }, (err, tags) => {
        if(err) return reject(err);
        resolve({ remainingAttacks, remainingStars });
      })
    })
  };

  const handleChatMessage = function(msg) {
    let command = msg.text.split(' ');
    let M = lang.l( this.locale );
    switch( command[0].toLowerCase().replace(process.env.BOT_NAME, '') ) {
      case '/start':
        bot.sendMessage( msg.chat.id, M('START', msg.from.username), {
          reply_to_message_id: msg.message_id,
          parse_mode: 'markdown'
        } );
      break;
      case '/help': 
        bot.sendMessage( msg.chat.id, M('HELP_PVT'), {
          reply_to_message_id: msg.message_id,
          parse_mode: 'markdown'
        } );      
      break;
      case '/add_tag':
        if( command.length !== 2 ) {
          return bot.sendMessage( msg.chat.id, 'Usage: /add_tag <tag>', {
            reply_to_message_id: msg.message_id
          } );
        }
        var tag = command[1];
        if( tag.length === 8 ) {
          tag = '#' + tag;
        }
        if(!/#[A-Z0-9]{8}/.test(tag)) {
          return bot.sendMessage( msg.chat.id, M('INVALID_TAG', tag), {
            reply_to_message_id: msg.message_id,
            parse_mode: 'markdown'
          } );
        }
        User.findOne({ tags: tag }).exec().then( u => {
          if( u !== null ) {
            return bot.sendMessage( msg.chat.id, M('USER_TAG_IN_USE'), {
            reply_to_message_id: msg.message_id,
            parse_mode: 'markdown'
          } );
          }
          this.tags.push( tag );
          this.save().then( u => {
            bot.sendMessage( msg.chat.id, M('USER_TAG_ADDED', tag, u.tags.map(t=>`\`${t}\``).join('\n ') ), {
            reply_to_message_id: msg.message_id,
            parse_mode: 'markdown'
          } );
          } )
        } );
      break;
      case '/remove_tag':
        if( command.length !== 2 ) {
          return bot.sendMessage( msg.chat.id, 'Usage: /remove_tag <tag>', {
            reply_to_message_id: msg.message_id
          } );
        }
        var tag = command[1];
        if( tag.length === 8 ) {
          tag = '#' + tag;
        }
        if(!/#[A-Z0-9]{8}/.test(tag)) {
          return bot.sendMessage( msg.chat.id, M('INVALID_TAG', tag), {
            reply_to_message_id: msg.message_id,
            parse_mode: 'markdown'
          } );
        }
        if( this.tags.indexOf(tag) < 0 ) {
          return bot.sendMessage( msg.chat.id, M('USER_TAG_NOT_FOUND', this.tags.map(t=>`\`${t}\``).join('\n ') ), {
            reply_to_message_id: msg.message_id,
            parse_mode: 'markdown'
          } );
        }
        this.tags.splice( this.tags.indexOf(tag), 1 );
        this.save().then( u => {
          bot.sendMessage( msg.chat.id, M('USER_TAG_REMOVED', tag, this.tags.map(t=>`\`${t}\``).join('\n ') ), {
            reply_to_message_id: msg.message_id,
            parse_mode: 'markdown'
          } );
        });
      break;
      case '/my_tags':
        if(this.tags.length){
          let tags = this.tags.map(t=>`\`${t}\``);
          Async.map(this.tags, ( t, next ) => {
            request.get( '/players/' + encodeURIComponent(t), (err, resp, user) => {
              return next(err, ' `' + t + '` ' + require('markdown-escape')(user.name).replace('\\','') + ' ' + emoji.get('european_castle') + ' '+ user.townHallLevel);
            });
          }, (err, tags) => {
            bot.sendMessage( msg.chat.id, M('USER_TAGS_LIST', tags.join('\n ') ), {
              reply_to_message_id: msg.message_id,
              parse_mode: 'markdown'
            } );
          } );
        }
        else
          bot.sendMessage( msg.chat.id, M('USER_TAGS_NONE'), {
            reply_to_message_id: msg.message_id,
            parse_mode: 'markdown'
          } );
      break;
      default: 
        bot.sendMessage( msg.chat.id, M('INVALID_COMMAND'), {
          reply_to_message_id: msg.message_id,
          parse_mode: 'markdown'
        } );
      break;
    }
  };

  const handleGroupChatMessage = function(msg) {
    let M = lang.l( this.locale );
    if( msg.new_chat_members || msg.group_chat_created ) {
      if( msg.group_chat_created || msg.new_chat_members.filter( u => u.id === parseInt(process.env.BOT_ID) ).length ) {
        this.adminTGIds.indexOf(msg.from.id.toString()) === -1 && this.adminTGIds.push(msg.from.id.toString());
        this.save().then(() => {
          bot.sendMessage( msg.chat.id, M('GROUP_JOINED') );
        });
      }
      else {
        bot.sendMessage( msg.chat.id, M('GROUP_NEW_MEMBER') );
      }
      return;
    }
    if( msg.left_chat_member && msg.left_chat_member.id.toString() === process.env.BOT_ID ) {
      Group.findOneAndDelete( { telegramId: msg.chat.id.toString() }, () => {
        console.log("Chat deleted")
      } );
    }

    if( ! msg.text ) {
      return;
    }

    let command = msg.text.split(' ');

    switch( command[0].toLowerCase().replace(process.env.BOT_NAME, '') ) {
      case '/help':
        bot.sendMessage( msg.chat.id, M('HELP_GROUP'), {
          reply_to_message_id: msg.message_id,
          parse_mode: 'markdown'
        } );   
      break;
      case '/manage':
        if( this.adminTGIds.indexOf(msg.from.id.toString()) < 0 ) {
          return bot.sendMessage( msg.chat.id, M('CLAN_MANAGE_UNAUTHORIZED'), {
            reply_to_message_id: msg.message_id
          });
        }
        bot.sendMessage( msg.chat.id, M('CLAN_MANAGE'), {
          reply_markup: {
            inline_keyboard: getManageKB(this)
          },
          reply_to_message_id: msg.message_id
        })
      break;
      case '/get_clan_tag':
        if( this.clan_tag ) {
          return bot.sendMessage( msg.chat.id , M( 'CLAN_TAG_GET', this.clan_tag ), {
            reply_to_message_id: msg.message_id,
            parse_mode: 'markdown'
          });
        }
        return bot.sendMessage( msg.chat.id , M( 'CLAN_TAG_GET_NONE' ), {
          reply_to_message_id: msg.message_id,
          parse_mode: 'markdown'
        });
      break;
      case '/set_clan_tag':
        const vtkb =  {
          inline_keyboard: [
            [
              {
                text: M('CLAN_TAG_VERIFY'),
                callback_data: 'CLAN_TAG_VERIFY'
              }
            ],
            [
              {
                text: M('CLAN_TAG_CANCEL'),
                callback_data: 'CLAN_TAG_CANCEL'
              }
            ]
          ]
        };
        if( this.clan_tag ) {
          if( this.verification_code ) {
            return bot.sendMessage( msg.chat.id, M( 'CLAN_TAG_UNVERIFIED', this.clan_tag, this.verification_code ), {
              reply_to_message_id: msg.message_id,
              reply_markup: vtkb,
              parse_mode: 'markdown'
            });
          }
          else {
            return bot.sendMessage( msg.chat.id , M( 'CLAN_TAG_EXISTS', this.clan_tag ), {
              reply_to_message_id: msg.message_id,
              parse_mode: 'markdown'
            });
          }
        }
        var tag = command[1];
        if( tag.length === 8 ) {
          tag = '#' + tag;
        }
        if(!/#[A-Z0-9]{8}/.test(tag)) {
          return bot.sendMessage( msg.chat.id, M('INVALID_TAG', tag), {
            reply_to_message_id: msg.message_id,
            parse_mode: 'markdown'
          } );
        }
        this.clan_tag = tag;
        this.verification_code = Crypto.createHash('md5').update(Math.random().toString()).digest("hex").substr(0,8);
        this.save().then(()=>{
          bot.sendMessage( msg.chat.id, M('CLAN_TAG_VERIFICATION_SENT', this.verification_code), {
            reply_to_message_id: msg.message_id,
            reply_markup: vtkb,
            parse_mode: 'markdown'
          });
        }).catch(e => {
          if(e.code === 11000) {
            bot.sendMessage( msg.chat.id, M('CLAN_TAG_IN_USE', tag), {
              reply_to_message_id: msg.message_id,
              parse_mode: 'markdown'
            });
          }
        });
      break;
      case '/add_admin':
        if( this.adminTGIds.indexOf(msg.from.id.toString()) < 0 ) {
          return bot.sendMessage(msg.chat.id, M('CLAN_MANAGE_UNAUTHORIZED'), {
            reply_to_message_id: msg.message_id,
            parse_mode: 'markdown'
          })
        }
        let newAdmin = command[1];
        if(/^\d+$/.test(newAdmin)) {
          this.adminTGIds.push( newAdmin );
          this.save().then(() => {
            return bot.sendMessage(msg.chat.id, M('ADMIN_ADDED'), { reply_to_message_id: msg.message_id, parse_mode: 'markdown'});
          });
          return;
        }
        newAdmin = newAdmin.replace('@','').toLowerCase();
        bot.getChatAdministrators(msg.chat.id).then(admins => {
          if(admins.map(a=>a.user.username.toLowerCase()).indexOf(newAdmin) == -1) {
            return bot.sendMessage(msg.chat.id, M('ADMIN_INVALID'), { reply_to_message_id: msg.message_id, parse_mode: 'markdown'});
          }
          newAdmin = admins.reduce((a, cur) => {
            if(cur.user.username.toLowerCase() === newAdmin) {
              a = cur.user.id.toString();
            }
            return a;
          }, null);
          if(!newAdmin) {
            return bot.sendMessage(msg.chat.id, M('ADMIN_INVALID'), { reply_to_message_id: msg.message_id, parse_mode: 'markdown'});
          }
          if(this.adminTGIds.indexOf(newAdmin) > -1) {
            return bot.sendMessage(msg.chat.id, M('ADMIN_DUPLICATE'), { reply_to_message_id: msg.message_id, parse_mode: 'markdown'});
          }
          this.adminTGIds.push(newAdmin);
          this.save().then(() => {
            return bot.sendMessage(msg.chat.id, M('ADMIN_ADDED'), { reply_to_message_id: msg.message_id, parse_mode: 'markdown'});
          });
        });
      break;
      case '/remove_admin':
        if( this.adminTGIds[0] !== msg.from.id.toString() ) {
          return bot.sendMessage(msg.chat.id, M('CLAN_MANAGE_UNAUTHORIZED'), {
            reply_to_message_id: msg.message_id,
            parse_mode: 'markdown'
          })
        }
        this.adminTGIds.splice(this.adminTGIds.indexOf(command[1]));
        this.save().then(msg.chat.id, M('ADMIN_REMOVED'), {
          reply_to_message_id: msg.message_id,
          parse_mode: 'markdown'
        });
      break;
      case '/get_admins':
        Async.mapSeries(this.adminTGIds, (id, next) => {
          bot.getChatMember(msg.chat.id, id).then(u => {
            next(null, u.user);
          }).catch(e => {
            next(null, {id});
          })
        }, (err, admins) => {
          return bot.sendMessage(msg.chat.id, [M('ADMIN_LIST')].concat(admins.map(u => (u.username ? '@'+u.username : false) || u.first_name+' '+(u.last_name||'') || M('INVALID_USER') + ': ' + u.id)).join('\n'), {
            reply_to_message_id: msg.message_id,
            parse_mode: 'markdown'
          })
        })
      break;
      case '/current_war': 
      case '/war': 
        request.get( '/clans/' + encodeURIComponent( this.clan_tag ) + '/currentwar', (err, req, war) => {
          if( war.state === 'notInWar' ) {
            return bot.sendMessage(msg.chat.id, M('WAR_NOT'), {
              reply_to_message_id: msg.message_id,
              parse_mode: 'markdown'
            });
          }
          if( war.state === 'preparation' ) {
            return bot.sendMessage(msg.chat.id, M('WAR_PREPARATION', moment(war.startTime,'YYYYMMDDTkkmmss.SSSZ').toString() ), {
              reply_to_message_id: msg.message_id,
              parse_mode: 'markdown'
            });
          }
          if( war.state === 'inWar' ) {
            let remaining = moment.utc(moment(war.endTime,'YYYYMMDDTkkmmss.SSSZ').diff(moment())).format("HH:mm:ss")
            let msgOpt = {
              reply_to_message_id: msg.message_id,
              parse_mode: 'markdown'
            };
            getRemainingAttacksAndStars(war).then( stuff => {
              let message0 = M('WAR_PROGRESS', 
                war.teamSize, 
                moment(war.startTime,'YYYYMMDDTkkmmss.SSSZ').toString(),
                remaining
              ) + `\n \`${war.clan.name}\`: ${emoji.get('star')} ${war.clan.stars} ${emoji.get('boom')} ${war.clan.destructionPercentage}%\n\`${war.opponent.name}\`: ${emoji.get('star')} ${war.opponent.stars} ${emoji.get('boom')} ${war.opponent.destructionPercentage}%`
              let message1 = [ M('WAR_REMAINING_ATTACKS') ];
              for(let u of stuff.remainingAttacks) {
                message1.push(u.mapPosition + '. `' + u.name + ' ' + emoji.get('european_castle') + '` ' + u.townHallLevel + ' ' + emoji.get('crossed_swords').repeat(u.attacks) );
              }
              let message2 = [ M('WAR_REMAINING_STARS') ];
              for(let u of stuff.remainingStars) {
                message2.push(u.mapPosition + '. `' + u.name + ' ' + emoji.get('european_castle') + '` ' + u.townHallLevel  + ' ' + emoji.get('star').repeat(u.stars) );
              }
              try {
                Async.series([
                  bot.sendMessage(msg.chat.id, message0, msgOpt),
                  bot.sendMessage(msg.chat.id, message1.join('\n'), msgOpt),
                  bot.sendMessage(msg.chat.id, message2.join('\n'), msgOpt)
                ]);
              }
              catch(e){}
            } );
          }
          if( war.state === 'warEnded' ) {
            let r = `${emoji.get('rotating_light')} War ended!\n`;
            if(war.clan.stars > war.opponent.stars || ( war.clan.stars === war.opponent.stars && war.clan.destructionPercentage > war.opponent.destructionPercentage ) ) {
              r += 'We won!';
            }
            else if(war.clan.stars < war.opponent.stars || ( war.clan.stars === war.opponent.stars && war.clan.destructionPercentage < war.opponent.destructionPercentage ) ) {
              r += 'We lost!';
            }
            else {
              r += 'It\'s a tie!';
            }
            return bot.sendMessage(msg.chat.id, r, {
              reply_to_message_id: msg.message_id,
              parse_mode: 'markdown'
            });
          }
        });
      break;
      case '/clan_info': 
      case '/clan':
        if(!this.clan_tag) {
          return bot.sendMessage( msg.chat.id , M( 'CLAN_TAG_GET_NONE' ), {
            reply_to_message_id: msg.message_id,
            parse_mode: 'markdown'
          });
        }
        request.get( '/clans/' + encodeURIComponent( this.clan_tag ), (err, req, body) => {
          Async.map(body.memberList, (m, next) => {
            request.get( '/players/' + encodeURIComponent(m.tag), (err, resp, user) => {
              m.townHall = user.townHallLevel;
              User.findOne({ tags: m.tag }).then((usr) => {
                console.log(usr);
                m.tg = {
                  id: usr.telegramId,
                  username: usr.telegramUsername
                };
                return next();
              }).catch(e => {
                m.tg = null;
                return next();
              })
            });
          }, () => {
            bot.sendMessage( msg.chat.id, formatClanInfo(body), {
              reply_to_message_id: msg.message_id,
              parse_mode: 'markdown'
            });
          });
        });
      break;
    }
  };

  const handleCallbackQuery = function(msg) {
    let M = lang.l(this.locale);
    if( this.adminTGIds.indexOf(msg.from.id.toString()) < 0 ) {
      return bot.answerCallbackQuery(msg.id, {
        text: M('CLAN_MANAGE_UNAUTHORIZED'),
        show_alert: true
      });
    }
    switch( msg.data ) {
      case 'CLAN_TAG_VERIFY':
        if( !this.verification_code ) {
          return bot.editMessageText( M('CLAN_NO_VERIFICATION_CODE') );
        }
        request('/clans/'+encodeURIComponent(this.clan_tag), (err, req, clan) => {
          if(clan.reason) {
            return bot.answerCallbackQuery(msg.id, {
              text: M('CLAN_TAG_ERROR:'+clan.reason, this.clan_tag),
              show_alert: true
            });
          }
          let verified = clan.description.indexOf( this.verification_code ) > -1;
          if( verified ) {
            let vc = this.verification_code;
            this.verification_code = null;
            this.save().then( () => {
              bot.editMessageText( M('CLAN_TAG_VERIFICATION_COMPLETE', this.clan_tag, vc), { chat_id: msg.message.chat.id, message_id: msg.message.message_id, parse_mode: 'markdown' } );
            });
          }
          else {
            bot.answerCallbackQuery(msg.id, {
              text: M('CLAN_TAG_VERIFICATION_FAILED', this.verification_code),
              show_alert: true
            });
          }
        } );
      break;
      case 'CLAN_TAG_CANCEL':
        this.verification_code = null;
        this.clan_tag = null;
        this.save().then(() => {
          bot.editMessageText(M('CLAN_TAG_VERIFICATION_CANCELLED'), { chat_id: msg.message.chat.id, message_id: msg.message.message_id, parse_mode: 'markdown' });
        });
      break;
      case 'CLAN_TAG_UNSET':
        bot.editMessageReplyMarkup( { inline_keyboard: getManageKB(this, 'CLAN_TAG_UNSET') }, { chat_id: msg.message.chat.id, message_id: msg.message.message_id } );
      break;
      case 'CLAN_TAG_UNSET:CONFIRM':
        this.clan_tag = null;
        this.output_channel = null;
        this.output_channel_verification = {};
        this.verification_code = null;
        this.save().then(g => {
          bot.editMessageText(M('CLAN_TAG_UNSET:DONE'), { chat_id: msg.message.chat.id, message_id: msg.message.message_id, parse_mode: 'markdown' });
          bot.answerCallbackQuery(msg.id, {
            text: M('CLAN_TAG_UNSET:DONE'),
            show_alert: true
          });
        });
      break;
      case 'WTG:ENABLE':
        this.warlog_to_group = true;
        this.save().then(g => {
          bot.editMessageReplyMarkup( { inline_keyboard: getManageKB(this) }, { chat_id: msg.message.chat.id, message_id: msg.message.message_id } );
        });
      break;
      case 'WTG:DISABLE':
        this.warlog_to_group = false;
        this.save().then(g => {
          bot.editMessageReplyMarkup( { inline_keyboard: getManageKB(this) }, { chat_id: msg.message.chat.id, message_id: msg.message.message_id } );
        });
      break;
      case 'CLAN_OPT_CHANNEL_SET':
        if(this.output_channel) {
          return bot.answerCallbackQuery( msg.id, {
            text: M('CLAN_OPT_CHANNEL_ALREADY_SET'),
            show_alert: true
          });
        }
        let code = Crypto.createHash('md5').update(Math.random().toString()).digest("hex").substr(0,8);
        this.output_channel_verification = {
          code: code,
          chat_id: msg.message.chat.id,
          message_id: msg.message.message_id,
          locale: this.locale
        };
        this.save().then(g => {
          bot.editMessageText( M('CLAN_OPT_CHANNEL_VERIFICATION_SENT', code), { 
            chat_id: msg.message.chat.id, 
            message_id: msg.message.message_id,
            parse_mode: 'markdown',
            reply_markup: { 
              inline_keyboard: [[{
                text: M('CLAN_OPT_CHANNEL_SET:CANCEL'),
                callback_data: 'CLAN_OPT_CHANNEL_SET:CANCEL'
              }]]
            }
          } );
        });
      break;
      case 'CLAN_OPT_CHANNEL_SET:CANCEL':
        this.output_channel_verification = {};
        this.save().then(g => {
          bot.editMessageText( M('CLAN_MANAGE'), { reply_markup: { inline_keyboard: getManageKB(this) }, chat_id: msg.message.chat.id, message_id: msg.message.message_id } );
        });
      break;
      case 'CLAN_OPT_CHANNEL_UNSET': 
        bot.editMessageReplyMarkup( { inline_keyboard: getManageKB(this, 'CLAN_OPT_CHANNEL_UNSET') }, { chat_id: msg.message.chat.id, message_id: msg.message.message_id } );
      break;
      case 'CLAN_OPT_CHANNEL_UNSET:CONFIRM':
        this.output_channel_verification = {};
        this.output_channel = null;
        this.save().then( () => {
          bot.editMessageText( M('CLAN_MANAGE'), { reply_markup: { inline_keyboard: getManageKB(this) }, chat_id: msg.message.chat.id, message_id: msg.message.message_id } );
          bot.answerCallbackQuery( msg.id, {
            text: M('CLAN_OPT_CHANNEL_UNSET'),
            show_alert: true
          })
        } );
      break;
      case 'WTC:ENABLE':
        this.warlog_to_channel = true;
        this.save().then(g => {
          bot.editMessageReplyMarkup( { inline_keyboard: getManageKB(this) }, { chat_id: msg.message.chat.id, message_id: msg.message.message_id } );
        });
      break;
      case 'WTC:DISABLE':
        this.warlog_to_channel = false;
        this.save().then(g => {
          bot.editMessageReplyMarkup( { inline_keyboard: getManageKB(this) }, { chat_id: msg.message.chat.id, message_id: msg.message.message_id } );
        });
      break;
      case 'CLAN_MANAGE_SET_LOCALE':
        let lkb = Object.keys(lang.locales).map( l => {
          return [{
            text: lang.locales[l].LOCALE_NAME,
            callback_data: 'CLAN_MANAGE_SET_LOCALE:'+l
          }]
        });
        lkb.push([{
          text: M('CLAN_MANAGE_SET_LOCALE:CANCEL'),
          callback_data: 'CLAN_MANAGE_SET_LOCALE:CANCEL'
        }])
        bot.editMessageText( M('CLAN_MANAGE_PICK_LOCALE'), { 
          chat_id: msg.message.chat.id, 
          message_id: msg.message.message_id,
          parse_mode: 'markdown',
          reply_markup: { 
            inline_keyboard: lkb
          }
        } );
      break;
      case 'CLAN_MANAGE_SET_LOCALE:CANCEL':
        bot.editMessageText( M('CLAN_MANAGE'), { reply_markup: { inline_keyboard: getManageKB(this) }, chat_id: msg.message.chat.id, message_id: msg.message.message_id, parse_mode: 'markdown' });
      break;
      default: 
        if(/CLAN_MANAGE_SET_LOCALE:.{5}/.test(msg.data)) {
          let lc = msg.data.match(/CLAN_MANAGE_SET_LOCALE:(.*)/)[1];
          this.locale = lc;
          this.save().then(() => {
            bot.editMessageText( M('CLAN_MANAGE'), { reply_markup: { inline_keyboard: getManageKB(this) }, chat_id: msg.message.chat.id, message_id: msg.message.message_id, parse_mode: 'markdown' });
            bot.answerCallbackQuery(msg.id, {
              text: M('CLAN_MANAGE_LOCALE_CHANGED', lc),
              show_alert: true
            })
          });
        }
      break;
    }
  }

  const verifyChannel = msg => {
    let code = msg.text.match(/CWB_CHAN=(.{8})/)[1];
    Group.findOne({ "output_channel_verification.code": code }).exec().then(g => {
      if( g !== null ) {
        let v = Object.assign({}, g.output_channel_verification);
        g.output_channel = msg.chat.id;
        g.output_channel_verification = {};
        g.save().then(() => {
          bot.editMessageText( lang.l(v.locale)('CLAN_MANAGE'), { reply_markup: { inline_keyboard: getManageKB(g) }, chat_id: v.chat_id, message_id: v.message_id } );
          bot.sendMessage( v.chat_id, lang.l(v.locale)('CLAN_OPT_CHANNEL_SET', msg.chat.title), { reply_to_message_id: v.message_id });
          bot.deleteMessage( msg.chat.id, msg.message_id );
        });
      }
    });
  }

  const getManageKB = (g, s) => {
    const P = (d, ...args) => {
      return [{
        text: lang.l(g.locale).call(null, d, args),
        callback_data: d
      }];
    };

    let kb = [];
    kb.push(P('CLAN_MANAGE_SET_LOCALE', g.locale));

    if( !g.clan_tag ) {
      return kb;
    }

    if( g.clan_tag && !g.verification_code ) {
      kb.push(P(s === 'CLAN_TAG_UNSET' ? 'CLAN_TAG_UNSET:CONFIRM' : 'CLAN_TAG_UNSET'));
    }

    kb.push(P(g.warlog_to_group ? 'WTG:DISABLE' : 'WTG:ENABLE'));

    if( g.output_channel ) {
      kb.push(P(s === 'CLAN_OPT_CHANNEL_UNSET' ? 'CLAN_OPT_CHANNEL_UNSET:CONFIRM' : 'CLAN_OPT_CHANNEL_UNSET'));
    }
    else {
      kb.push(P(s === 'CLAN_OPT_CHANNEL_SET' ? 'CLAN_OPT_CHANNEL_SET:VERIFY' : 'CLAN_OPT_CHANNEL_SET'));
    }

    if( g.output_channel ) {
      kb.push(P(g.warlog_to_channel ? 'WTC:DISABLE' : 'WTC:ENABLE'));
    }

    return kb;
  };

  const formatClanInfo = clan => {
    let lines = [];
    lines.push( '*' + clan.name + '*  `' + clan.tag + '`' + emoji.get('flag-'+clan.location.countryCode.toLowerCase() ) );
    lines.push( '*Level* ' + clan.clanLevel + ' - ' + emoji.get('trophy') + ' ' + clan.clanPoints );
    lines.push( '*Members* ( ' + clan.members + ')' );
    clan.memberList.forEach(m => {
      let tg = '';
      if(m.tg) {
        tg = emoji.get('airplane') + ' @' + require('markdown-escape')(m.tg.username)
      }
      lines.push( ' ' + m.clanRank + '. `' + m.name + '` (`' + m.tag + '`) ' + emoji.get('european_castle') + ' ' + m.townHall + ' ' + tg);
    });
    return lines.join('\n');
  }

  bot.getMe().then(bot => {
    process.env.BOT_ID = bot.id;
    process.env.BOT_NAME = '@' + bot.username.toLowerCase();
  });

  bot.on('message', msg => {
    if(isGroupChat(msg)) {
      return getGroup(msg).then(chat => {
        handleGroupChatMessage.call(chat, msg);
      });
    }
    return getUser(msg).then(chat => {
      handleChatMessage.call(chat, msg);
    });
  });

  bot.on('callback_query', msg => {
    if(!isGroupChat(msg.message))
      return;
    getGroup(msg.message).then( chat => {
      handleCallbackQuery.call(chat, msg);
    } ); 
  });

  bot.on('channel_post', msg => {
    if(/CWB_CHAN=.{8}/.test(msg.text)) {
      verifyChannel(msg);
    }
  });

  this.setLang = l => {lang = l; return this;};
}