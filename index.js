'use strict';

const express = require('express');
const bodyParser = require('body-parser');
const request = require('request');
const app = express();

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
        contine; 
      }
      sendTextMessage(sender, "Text received, echo: " + text.substring(0, 200)); 
    } 

    if (event.postback) {
      let text = JSON.stringify(event.postback);
      sendTextMessage(sender, "Postback received: " + text.substring(0, 200), token);
      contine; 
    }
  });
  res.sendStatus(200);
});

const token = process.env.FB_PAGE_ACCESS_TOKEN

function sendTextMessage(sender, text) {
  let messageData = { text: text };
  request({
    url: 'https://graph.facebook.com/v2.6/me/messages',
    qs: { access_token: token },
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
            "title": "web url"
          }, {
            "type": "postback",
            "title": "Postback",
            "payload": "Payload for first element in a generic bubble"
          }]
        }, {
          "title": "Second card",
          "subtitle": "Element #2 of an hscroll",
          "image_url": "http://mlb.mlb.com/images/players/action_shots/514888.jpg",
          "butons": [{
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
    qs: { access_token: token },
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

