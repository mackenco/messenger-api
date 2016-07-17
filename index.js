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
    'date': '7/16/2016, 12:00:00 AM',
    'scoreString': 'The Seatle Mariners beat the Houston Astros 1-0 on July 16.' 
  },
  {
    'date': '7/15/2016, 12:00:00 AM',
    'scoreString': 'The Houston Astros beat the Seattle Mariners 7-3 on July 15.' 
  }]
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
        var date = firstEntityValue(entities, 'date');
        var team = gameData[team];

        context.score = _.findWhere(team, {date: date}).scoreString;
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

