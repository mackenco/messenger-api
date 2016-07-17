'use strict';

const express = require('express');
const bodyParser = require('body-parser');
const request = require('request');
const _ = require('underscore');
const Wit = require('node-wit').Wit;
const log = require('node-wit').log;
const app = express();

const fbToken = process.env.FB_PAGE_ACCESS_TOKEN;
const witToken = process.env.WIT_ACCESS_TOKEN; 

const gameData = {
  'Astros':[{
    'date': '2016-07-16',
    'scoreString': 'The Seatle Mariners beat the Houston Astros 1-0 on July 16.' 
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
            "St. Louis Cardinals (+9)", "Pittsburgh Pirates (+10.5)", "Philadelphia Phillies (+14.5)", "Colorado ROckies (+14.5)", "San Diego Padres (+16.5)", 
            "Milwaukee Brewers (+17)", "Arizona DIamondbacks (+18)", "Cincinnati Reds (+23)", "Atlanta Braves (+25)"]
  }
}

const wit = new Wit({
  accessToken: witToken,
  actions: {
    send({sessionId}, {text}) {
      const recipientId = sessions[sessionId].fbid;
      if (recipientId) {
        return sendTextMessage(recipientId, text)
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
        var team = firstEntityValue(entities, 'team');
        var date = firstEntityValue(entities, 'datetime').split("T")[0];
        var teamGameData = gameData[team];

        context.score = _.findWhere(teamGameData, {date: date}).scoreString;
        return resolve(context);
      }); 
    },
    getStandings({context, entities}) {
      return new Promise(function(resolve, reject) {
        var division = firstEntityValue(entities, 'division');
        console.log(division);
        var league = firstEntityValue(entities, 'league'); 
        console.log(league);
        var leagueData = standingsData[league];
        console.log(leagueData);
        var standings = division ? leagueData[division] : leagueData['all']; 
        console.log(standings);

        context.standings = standings.join("\n");
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
            sendTextMessage(sender, 'Sorry, I can only process text messages for now.')
            .catch(console.error); 
          } else if (text) {
            wit.runActions(sessionId, text, sessions[sessionId].context)
            .then((context) => {
              console.log('Waiting for next user message.');
              sessions[sessionId].context = context;
            })
            .catch((err) => {
              console.error('Oops! Got an error from Wite: ', err.stack || err); 
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


function sendTextMessage(sender, text) {
  let messageData = { text: text };
  request({
    url: 'https://graph.facebook.com/v2.6/me/messages',
    qs: { access_token: fbToken },
    method: 'POST',
    json: {
      recipient: { id: sender },
      message: messageData, 
    } 
  }, function(error, response, body) {
    if (error) {
      console.log('Error sending messages: ', error); 
    } else if (response.body.error) {
      console.log('Error: ', response.body.error); 
    } 
  });
}

function sendGenericMessage(sender) {
  let messageData = {
    "attachment": {
      "type": "template",
      "payload": {
        "template_type": "generic",
        "elements": [{
          "title": "First card",
          "subtitle": "Element #1 of an hscroll",
          "image_url": "http://mlb.mlb.com/mlb/images/players/head_shot/514888.jpg",
          "buttons": [{
            "type": "web_url",
            "url": "http://m.mlb.com/player/514888/jose-altuve",
            "title": "Open Web URL"
          }, {
            "type": "postback",
            "title": "Postback",
            "payload": "Payload for first element in a generic bubble"
          }]
        }, {
          "title": "Second card",
          "subtitle": "Element #2 of an hscroll",
          "image_url": "http://mlb.mlb.com/images/players/action_shots/514888.jpg",
          "buttons": [{
            "type": "postback",
            "title": "Postback",
            "payload": "Payload for a second element in a generic bubble"
          }]
        }] 
      } 
    } 
  };

  request({
    url: 'https://graph.facebook.com/v2.6/me/messages',
    qs: { access_token: fbToken },
    method: 'POST',
    json: {
      recipient: { id: sender },
      message: messageData 
    } 
  }, function(error, response, body) {
    if (error) {
      console.log('Error sending messages: ', error); 
    } else if (response.body.error) {
      console.log('Error: ', response.body.error); 
    } 
  });
}

app.listen(app.get('port'), function() {
  console.log('magic happenin on: ', app.get('port'));  
});

