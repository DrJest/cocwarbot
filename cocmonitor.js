const Path = require('path');
const Async = require('async');
const emoji = require('node-emoji');
const moment  = require('moment');
const Lang = require( __dirname + '/lang' );

const User  = require( Path.join( __dirname, 'model',  'user' ) );
const Group = require( Path.join( __dirname, 'model', 'group' ) );
const Request = require('request');

module.exports = function(bot, request) {
  let lang = new Lang( __dirname + '/locales/' );
  let refreshRate = 5 * 60 * 1000;

  const getOrderedAttacks = war => {
    let all_attacks = [];
    war.clan.members.forEach(m => {
      if(m.attacks) {
        all_attacks = all_attacks.concat(m.attacks);
      }
    });
    war.opponent.members.forEach(m => {
      if(m.attacks) {
        all_attacks = all_attacks.concat(m.attacks);
      }
    });
    all_attacks.sort((a,b) => a.order - b.order);
    return all_attacks;
  };


  const getPadded = (str1, str2) => {
    if(!str2) str2 = 'XX';
    return str1.toString() + (str1.toString().length > str2.toString().length ? '' : ' '.repeat(str2.toString().length - str1.toString().length));
  };

  const getByTag = (war, tag) => {
    for(let i in war.clan.members) {
      if(war.clan.members[i].tag === tag) return war.clan.members[i];
    }
    for(let i in war.oppn.members) {
      if(war.oppn.members[i].tag === tag) return war.oppn.members[i];
    }
    return '---';
  };

  const atksSoFar = (clan, atk) => {
    return clan.members.reduce((atks, cur) => {
      if(cur.attacks) {
        cur.attacks.forEach(a => {
          if(a.order <= atk.order)
            atks++;
        });
      }
      return atks;
    }, 0);
  };

  const starsSoFar = (clan, atk) => {
    return clan.members.reduce((res, cur) => {
      if(cur.attacks) {
        cur.attacks.forEach(a => {
          if(a.order <= atk.order) {
            res.opponents[a.defenderTag] = res.opponents[a.defenderTag] || 0;
            res.opponents[a.defenderTag] = Math.max(res.opponents[a.defenderTag], a.stars);
          }
        });
      }
      res.totalStars = Object.values(res.opponents).reduce((a,b)=>a+b, 0);
      return res;
    }, {opponents: {}, totalStars: 0}).totalStars;
  };

  const destructionSoFar = (clan, atk) => {
    return clan.members.reduce((res, cur) => {
      if(cur.attacks) {
        cur.attacks.forEach(a => {
          if(a.order <= atk.order) {
            res.opponents[a.defenderTag] = res.opponents[a.defenderTag] || 0;
            res.opponents[a.defenderTag] = Math.max(res.opponents[a.defenderTag], a.destructionPercentage);
          }
        });
      }
      res.totalDestruction = Math.round(Object.values(res.opponents).reduce((a,b)=>a+b, 0) / clan.members.length * 100) / 100;
      return res;
    }, {opponents: {}, totalDestruction:0}).totalDestruction;
  }

  const warAttackMessage = (war, atk) => {
    let oldStars = war.orderedAttacks.reduce((a,cur) => {
      if(cur.defenderTag === atk.defenderTag && cur.order < atk.order) {
        return Math.max(a, cur.stars);
      }
      return a;
    }, 0);

    let maxStars = war.teamSize * 3;
    let maxAtks = war.teamSize * 2;

    let isAtk = war.clan.members.map(m => m.tag).indexOf(atk.attackerTag) > -1;
    let newStars = Math.max(0, atk.stars - oldStars);

    let attacker = getByTag(war, atk.attackerTag);
    let defender = getByTag(war, atk.defenderTag);

    return  `\`${emoji.get(isAtk?'small_blue_diamond':'small_orange_diamond')} [${atk.order}] ${attacker.name} ${emoji.get('vs')} ${defender.name} \n` +
            `Attacker: TH ${getPadded(attacker.townhallLevel)} MP ${getPadded(attacker.mapPosition)} ${attacker.name}\n` + 
            `Defender: TH ${getPadded(defender.townhallLevel)} MP ${getPadded(defender.mapPosition)} ${defender.name}\n` + 
            `Result: ${emoji.get('o').repeat(oldStars)}${emoji.get('star').repeat(newStars)} | ${atk.destructionPercentage}% \n` + 
            `${emoji.get('white_small_square')} ${atksSoFar(war.clan, atk)}/${maxAtks} ${emoji.get('star')} ${starsSoFar(war.clan, atk)}/${maxStars} | ${destructionSoFar(war.clan, atk)}% \n` + 
            `${emoji.get('black_small_square')} ${atksSoFar(war.oppn, atk)}/${maxAtks} ${emoji.get('star')} ${starsSoFar(war.oppn, atk)}/${maxStars} | ${destructionSoFar(war.oppn, atk)}% \n` + 
            `\``;
  };

  const warAheadMessage = war => {
    return  `\`${emoji.get('rotating_light')} ${war.teamSize} fold war is Ahead!\n` +
            `${emoji.get('white_small_square')} Clan ${getPadded(war.clan.name, war.oppn.name)} L${getPadded(war.clan.clanLevel,war.oppn.clanLevel)} ${war.clan.info.location.name} ${emoji.get('flag-'+war.clan.info.location.countryCode.toLowerCase())}\n`+
            `${emoji.get('black_small_square')} Clan ${getPadded(war.oppn.name, war.clan.name)} L${getPadded(war.oppn.clanLevel,war.clan.clanLevel)} ${war.oppn.info.location.name} ${emoji.get('flag-'+war.oppn.info.location.countryCode.toLowerCase())}\n`+
            `Game begins at ${moment(war.startTime,'YYYYMMDDTkkmmss.SSSZ').toString()}` + 
            `\``;
  };

  const playerListMessage = (clan, isOpponent) => {
    let color = isOpponent ? 'black' : 'white';

    return `\`` + 
            `${emoji.get(color + '_circle')} ${isOpponent?'Opponent':'Our'} Clan: ${clan.name}\n` + 
            `${emoji.get('zap')} MP TH Name\n` + 
            clan.members.sort((a,b) => a.mapPosition-b.mapPosition).map(m => {
              return emoji.get(color + '_small_square') + ' ' + getPadded(m.mapPosition, 'XX') + ' ' + getPadded(m.townhallLevel, 'XX') + ' ' + m.name
            }).join('\n') +
            `\``;
  };

  const warStartedMessage = war => {
    return `\`${emoji.get('rotating_light')} War has begun!\n` +
           `War ends at ${moment(war.endTime,'YYYYMMDDTkkmmss.SSSZ').toString()}`+
           `\``;
  };

  const warEndedMessage = war => {
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
    return r;
  };

  const getClanInfo = tag => {
    return new Promise((resolve, reject) => {
      request.get('/clans/'+encodeURIComponent( tag ), (err, req, clan) => {
        if(err)
          reject(err);
        resolve(clan);
      })
    });
  };

  const getWarStatus = clan_tag => {
    return new Promise((resolve, reject) => {
      request.get( '/clans/' + encodeURIComponent( clan_tag ) + '/currentwar', (err, req, war) => {
        if(err) {
          return reject({error: err});
        }
        if(war.state === 'notInWar' || !war.clan) {
          war.oppn = war.opponent;
          return resolve(war);
        }
        Promise.all([getClanInfo(war.clan.tag), getClanInfo(war.opponent.tag)]).then(clans => {
          war.clan.info = clans[0];
          war.oppn = war.opponent;
          war.oppn.info = clans[1];
          resolve(war);
        });
      });
    })
  };

  const updateWarStatus = (g, next) => {
    let M = lang.l( g.locale );
    getWarStatus(g.clan_tag).then(war => {
      const msgQueue = [];
      if( !g.currentwar ) {
        g.currentwar = {
          state: 'notInWar'
        };
      }
      if( !g.currentwar.attacks ) {
        g.currentwar.attacks = [];
      }

      if(war.state === 'notInWar') {
        if( g.currentwar.state !== 'notInWar' && g.currentwar.state !== 'warEnded' ) {
          g.currentwar.attacks = [];
          msgQueue.push(warEndedMessage(war));
        }
      }
      else if(war.state === 'preparation') {
        if( g.currentwar.state === 'notInWar' ) {
          msgQueue.push(warAheadMessage(war));
          msgQueue.push(playerListMessage(war.clan));
          msgQueue.push(playerListMessage(war.oppn, 1));
        }
      }
      else if( war.state === 'inWar' ) {
        if( g.currentwar.state !== 'inWar' ) {
          msgQueue.push(warStartedMessage(war));
        }
        let attacks = getOrderedAttacks(war);
        war.orderedAttacks = attacks;

        if( attacks.length > g.currentwar.attacks.length ) {
          let toNotify = attacks.slice( g.currentwar.attacks.length - attacks.length );
          toNotify.forEach(e => {
            msgQueue.push(warAttackMessage(war, e));
          });
          if(war.clan.stars === war.clan.members.length * 3 && g.currentwar.clanStars < war.clan.stars) {
            msgQueue.push(emoji.get('punch') + ' We destroyed them 100%!');
          } 
          if(war.oppn.stars === war.oppn.members.length * 3 && g.currentwar.opponentStars < war.oppn.stars) {
            msgQueue.push(emoji.get('skull') + ' They destroyed us 100%!');
          } 
        }
        g.currentwar.attacks = attacks;
      }
      else if( war.state === 'warEnded' ) {
        let attacks = getOrderedAttacks(war);
        war.orderedAttacks = attacks;

        if( attacks.length > g.currentwar.attacks.length ) {
          let toNotify = attacks.slice( g.currentwar.attacks.length - attacks.length );
          toNotify.forEach(e => {
            msgQueue.push(warAttackMessage(war, e));
          });
          if(war.clan.stars === war.clan.members.length * 3 && g.currentwar.clanStars < war.clan.stars) {
            msgQueue.push(emoji.get('punch') + ' We destroyed them 100%!');
          } 
          if(war.oppn.stars === war.oppn.members.length * 3 && g.currentwar.opponentStars < war.oppn.stars) {
            msgQueue.push(emoji.get('skull') + ' They destroyed us 100%!');
          } 
        }
        g.currentwar.attacks = attacks;
        if(g.currentwar.state === 'inWar') {
          msgQueue.push(warEndedMessage(war));
        }
      }

      g.currentwar.clanStars = war.clan.stars;
      g.currentwar.opponentStars = war.opponent.stars;
      g.currentwar.state = war.state;
      g.markModified('currentwar');
      
      let promises = [];
      if(g.warlog_to_group) {
        let pg = Async.eachSeries(msgQueue, (el, cb) => {
          bot.sendMessage(g.telegramId, el, {
            parse_mode: 'markdown'
          }).then(()=>cb()).catch(console.log);
        });
        promises.push(pg);
      }
      if(g.warlog_to_channel) {
        let pc = Async.eachSeries(msgQueue, (el, cb) => {
          bot.sendMessage(g.output_channel, el, {
            parse_mode: 'markdown'
          }).then(()=>cb()).catch(console.log);
        });
        promises.push(pc);
      }
      promises.push(g.save());

      Promise.all(promises).then(() => next());
    }).catch((e) => {
      console.log(e)
      next();
    });
  };

  const watchWarEvents = starting => {
    if(starting) {
      console.log("Starting watch");
    }
    Group.find({
      "$and": [
        {
          "clan_tag": { "$ne": null }
        },
        {
          "$or": [
            {
              "warlog_to_channel": true
            },
            {
              "warlog_to_group": true
            }
          ]
        }
      ]
    }).then(groups => {
      Async.each(groups, updateWarStatus, () => {
        console.log("Status Updated @" + new Date().toLocaleString());
        setTimeout(watchWarEvents, refreshRate);
      });
    });
  };

  this.setLang = l => {lang = l; return this;};
  this.startWatch = watchWarEvents.bind(null, true);
}