'use strict';

const express = require('express');
const bodyParser = require('body-parser');
const request = require('request');
const fetch = require('node-fetch');
const _ = require('underscore');
const Wit = require('node-wit').Wit;
const log = require('node-wit').log;
const app = express();

const fbToken = process.env.FB_PAGE_ACCESS_TOKEN;
const witToken = process.env.WIT_ACCESS_TOKEN; 

const gameData = {
  'Astros':[{
    'date': '2016-07-16',
    'title': 'The Seatle Mariners beat the Houston Astros 1-0 on July 16.',
    'image': 'http://m.mlb.com/assets/images/9/4/4/189989944/cuts/Martin1280_cqe84jx2_p9jo6pyt.jpg',
    'recap': 'http://m.mlb.com/news/article/189965930/mariners-defeat-astros-in-pitchers-duel/',
    'page': 'http://mlb.mlb.com/mlb/gameday/index.jsp?gid=2016_07_16_houmlb_seamlb_1#game=2016_07_16_houmlb_seamlb_1,game_state=Wrapup'
  },
  {
    'date': '2016-07-15',
    'scoreString': 'The Houston Astros beat the Seattle Mariners 7-3 on July 15.' 
  }]
}

const standingsData = {
  "AL" : {
    "east": ["1. Baltimore Orioles", "2. Boston Red Sox (+1.5)", "3. Toronto Blue Jays (+3.5)", "4. New York Yankees (+9)", "5. Tampa Bay Rays (+18.5)"],
    "central": ["1. Cleveland Indians", "2. Detroit Tigers (+6)", "3. Kansas City Royals (+7.5)", "4. Chicago White Sox (+8)", "5. Minnesota Twins (+20)"],
    "west": ["1. Texas Rangers", "2. Houston Astros (+5)", "3. Seattle Mariners (+8)", "4. Oakland Athletics (+14)", "5. Los Angeles Angels (+15)"],
    "all": ["Texas Rangers", "Baltimore Orioles (+0.5)", "Cleveland Indians (+0.5)", "Boston Red Sox (+2)", "Toronto Blue Jays (+4)", "Houston Astros (+5)", 
            "Detroit Tigets (+6.5)", "Seattle Mariners (+8)", "Kansas City Royals (+8)", "Chicago White Sox (+8.5)", "New York Yankees (+9.5)", 
            "Oakland Athletics (+14)", "Los Angeles Angels (+15)", "Tampa Bay Rays (+19)", "Minnesota Twins (+20.5)"]
  },
  "NL": {
    "east": ["1. Washington Nationals", "2. New York Mets(+6.5)", "3. Miami Marlins (+7)", "4. Philadelphia Phillies (+13.5)", "5. Atlanta Braves (+24.5)"],
    "central": ["1. Chicago Cubs", "2. St. Louis Cardinals (+7.5)", "3. Pittsburgh Pirates (+9)", "4. Milwaukee Brewers (+15.5)", "5. Cincinnati Reds (+21.5)"],
    "west": ["1. San Francisco Giants", "2. Los Angeles Dodgers (+5.5)", "3. Colorado Rockies (+14)", "4. San Diego Padres (+16.5)", "5. Arizona Diamondbacks (+18)"],
    "all": ["San Francisco Giants", "Washington Nationals (+1)", "Chicago Cubs (+1.5)", "Los Angeles Dodgers (+5.5)", "New York Mets (+7.5)", "Miami Marlins (+8)", 
            "St. Louis Cardinals (+9)", "Pittsburgh Pirates (+10.5)", "Philadelphia Phillies (+14.5)", "Colorado Rockies (+14.5)", "San Diego Padres (+16.5)", 
            "Milwaukee Brewers (+17)", "Arizona DIamondbacks (+18)", "Cincinnati Reds (+23)", "Atlanta Braves (+25)"]
  }
}

const wit = new Wit({
  accessToken: witToken,
  actions: {
    send({sessionId}, {text}) {
      const recipientId = sessions[sessionId].fbid;
      if (recipientId) {
        console.log('send is firing');
        var t = text.attachment || text;
        console.log('text is: ', t);
        return fbMessage(recipientId, t)
        .then(() => null)
        .catch((err) => {
          console.error('Oops, something went wrong while forward the response to ', recipientId, ':', err.stack || err); 
        });
      } else {
          console.error('Oops, Cannot find user for session:', sessionId);
          return Promise.resolve(); 
      }
    },
    getScore({context, entities}) {
      return new Promise(function(resolve, reject) {
        console.log('get scores is firing');
        var team = firstEntityValue(entities, 'team');
        var date = firstEntityValue(entities, 'datetime').split("T")[0];
        if (!team && !date) { return resolve(context); }

        var teamGameData = gameData[team];
        var game = _.findWhere(teamGameData, {date: date});
        console.log('game:', game);
        // context.score = game.title;
        context.score = buildGenericMessage(game);
        return resolve(context);
      }); 
    },
    getStandings({context, entities}) {
      return new Promise(function(resolve, reject) {
        console.log('get standings is firing');
        var division = firstEntityValue(entities, 'division');
        var league = firstEntityValue(entities, 'league'); 
        if (!division && !league) { return resolve(context); }

        var leagueData = standingsData[league];
        var standings = division ? leagueData[division] : leagueData['all']; 
        var ordinal = firstEntityValue(entities, 'ordinal');

        var response;
        if (ordinal) { 
          var place = ordinal - 1;
          var team = standings[place];
          response = team ? team : "I\'m sorry, your question doesn\'t make sense";
        } else {
          response = standings.join("\n");
        }

        context.standings = response; 
        return resolve(context);
      });
    }
  },
  logger: new log.Logger(log.INFO)
});

const sessions = {};

const findOrCreateSession = (fbid) => {
  let sessionId;
  Object.keys(sessions).forEach(k => {
    if (sessions[k].fbid === fbid) { sessionId = k; } 
  });
  if (!sessionId) {
    sessionId = new Date().toISOString();
    sessions[sessionId] = {fbid: fbid, context: {}}; 
  }
  return sessionId;
};

const firstEntityValue = (entities, entity) => {
  const val = entities && entities[entity] &&
    Array.isArray(entities[entity]) &&
    entities[entity].length > 0 &&
    entities[entity][0].value
  ;
  if (!val) {
      return null;
    }
  return typeof val === 'object' ? val.value : val;
};

app.set('port', (process.env.PORT || 8080));

app.use(bodyParser.urlencoded({extended: false}));
app.use(bodyParser.json());

app.get('/', function (req, res) {
  res.send('Hello'); 
});

app.get('/webhook/', function(req, res) {
  if (req.query['hub.verify_token'] === 'hi_please_verify_me') {
    res.send(req.query['hub.challenge']);  
  }
  res.sendStatus(400);
});

app.post('/webhook/', function(req, res) {
  const data = req.body;

  if (data.object === 'page') {
    data.entry.forEach(entry => {
      entry.messaging.forEach(event => {
        if (event.message) {
          const sender = event.sender.id;
          const sessionId = findOrCreateSession(sender);
          const {text, attachments} = event.message;

          if (attachments) {
            fbMessage(sender, 'Sorry, I can only process text messages for now.')
            .catch(console.error); 
          } else if (text) {
            wit.runActions(sessionId, text, sessions[sessionId].context)
            .then((context) => {
              console.log('Waiting for next user message.');
              sessions[sessionId].context = context;
            })
            .catch((err) => {
              console.error('Oops! Got an error from Wit: ', err.stack || err); 
            })
          } else {
            console.log('received event', JSON.stringify(event)); 
          }
        } 
      });
    });
  }
  res.sendStatus(200);
});

const fbMessage = (id, text) => {
  const body = JSON.stringify({
    recipient: { id },
    message: { text },
  });
  console.log('body is ', body);
  const qs = 'access_token=' + encodeURIComponent(fbToken);
  return fetch('https://graph.facebook.com/v2.6/me/messages?' + qs, {
    method: 'POST',
    headers: {'Content-Type': 'application/json'},
    body,    
  })
  .then(rsp => rsp.json())
  .then(json => {
    if (json.error && json.error.message) {
      throw new Error(json.error.message); 
    }
    return json; 
  });
};

function buildGenericMessage(message) {
  var obj = {
    "attachment": {
      "type": "template",
      "payload": {
        "template_type": "generic",
        "elements": [{
          "title": message.title,
          "image_url": message.image, 
          "buttons": [{
            "type": "web_url",
            "url": message.page,
            "title": "View on game on MLB.com"
          }, {
            "type": "web_url",
            "url": message.recap,
            "title": "Recap"
          }]
        }] 
      } 
    }
  };
  return obj;
}

app.listen(app.get('port'), function() {
  console.log('magic happenin on: ', app.get('port'));  
});

