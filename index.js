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
      sendTextMessage(sender, "Text received, echo: " + text.substring(0, 200)); 
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

app.listen(app.get('port'), function() {
  console.log('magic happenin on: ', app.get('port'));  
});

