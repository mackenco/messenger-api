'use strict';

const express = require('express');
const bodyParser = require('body-parser');
const request = require('request');
const _ = require('underscore');
const {Wit, log} = require('node-wit');
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

const witClient = new Wit({
  accessToken: witToken,
  actions: {
    send(request, response) {
      return new Promise(function(resolve, reject) {
        console.log(JSON.stringify(response));
        return resolve(); 
      }); 
    },
    getScore({context, entities}) {
      return new Promise(function(resolve, reject) {
        var team = firstEntityValue(entities, 'team');
        var date = firstEntityValue(entities, 'date');
        var team = gameData[team];

        context.score = _.findWhere(team, {date: date}).scoreString;
        return resolve(context);
      }); 
    },
  }
});

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
  res.send('Error, wrong token');  
});

app.post('/webhook/', function(req, res) {
  let messaging_events = req.body.entry[0].messaging;
  messaging_events.forEach(function(event) {
    let sender = event.sender.id;
    if (event.message && event.message.text) {
      let text = event.message.text;
      if (text === 'Generic') {
        sendGenericMessage(sender);
        return;
      }
      sendTextMessage(sender, "Text received, echo: " + text.substring(0, 200)); 
    } 

    if (event.postback) {
      let text = JSON.stringify(event.postback);
      sendTextMessage(sender, "Postback received: " + text.substring(0, 200), fbToken);
      return;
    }
  });
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

