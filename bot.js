
// RTM stuff
var RtmClient = require('@slack/client').RtmClient;
var botToken = process.env.SLACK_BOT_TOKEN || '';
var rtm = new RtmClient(botToken);

// Web Client stuff
var WebClient = require('@slack/client').WebClient;
var webToken = process.env.SLACK_BOT_TOKEN || '';
var web = new WebClient(webToken);

var RTM_EVENTS = require('@slack/client').RTM_EVENTS;

// MongoDB Stuff
var mongoose = require('mongoose');
var User = require('./models/models').User;
var Event = require('./models/models').Event;
var axios = require('axios');

rtm.start();                                  // Start the rtm client

rtm.on(RTM_EVENTS.MESSAGE, function handleRtmMessage(msg) {
  var dm = rtm.dataStore.getDMByUserId(msg.user);

  // The slack bot should only respond if the user is sending them a direct msg
  if(!isDirectMessage(dm, msg)) {
    console.log('message not a direct message, ignoring it.')
    return;
  }

  // Create a new user if none exists
  User.findOne({slackId: msg.user})
  .then(function(user) {
    return createNewUser(user, msg.user, msg.channel);
  })
  .then(function(user) {

    // If the user is NOT authenticated, send the user a link to authenticate with google
    if(!user.google || user.google.expiry_date <= Date.now()) {
      var connectString = process.env.DOMAIN + `connect?userId=${user._id}`;
      rtm.sendMessage(`Hello, This is Schedule Bot. In order to schedule reminders for you, I need access to your Google calendar. Please visit ${connectString} to setup Google Calendar.`, msg.channel)
      return;
    }

    // Since the user is authenticated, check if convo with bot is pending
    User.findOne({slackId: msg.user})
    .exec(function(err, foundUser) {
      if(foundUser.isPending) {
        postWarningMessage(msg.channel);    // User is pending, so send warning msg in slack
        return;
      }

      var regex = /<@\w+>/g
      var users = [];
      msg.text = msg.text.replace(regex, function(match) {
        var userId = match.slice(2, -1);
        var user = rtm.dataStore.getUserById(userId);
        console.log("USER IN BOT.JS", user);
        users.push({
          displayName: user.profile.real_name,
          email: user.profile.email,
          profile: user.profile,
          slackId: user.id
        })

        return user.profile.first_name || user.profile.real_name
      })

      console.log('msg is: ', msg.text);

      // User is not pending, then make a call to the api and start a convo!
      apiAiQuery(msg)
      .then(resp => {

        if(resp.data.result.actionIncomplete) {
          rtm.sendMessage(resp.data.result.fulfillment.speech, msg.channel);
        } else {
          // If Response is complete, find intent in response, (meeting or reminder)
          switch (resp.data.result.metadata.intentName) {
            case 'meeting':
              console.log('Creating meeting . . .');
              User.findOne({slackId: msg.user})
                .exec(function(err, foundUser){
                  if(!foundUser || err){
                    console.log('Error: ', err);
                    return;
                  }
                    var info = extractInfoFromResp(resp);               // Extract all info
                    updateUserAsPendingForEvent(info, msg.user, users);
                    postInteractiveMessageForEvent(info, msg.channel);
                });
              break;
            case 'reminder':
              console.log('creating reminder .. .');
              User.findOne({slackId: msg.user})
              .exec(function(err, foundUser){
                var date = resp.data.result.parameters.date;
                var subject = resp.data.result.parameters.thing;
                // create user for the first time
                if(!foundUser || err) {
                  console.log("Error: ", err);
                  return;
                }
                  updateUserAsPending(date, subject, msg.user);
                  postInteractiveMessage(date, subject, msg.channel);
              });
              break;
            default:
              console.log("Intent name not found in switch! Intent Name: ", resp.data.result.metadata.intentName);
              return;
          }
        }
      })
      .catch(err => { console.log("Error: ", err) });
    });
  })
  .catch(err => { console.log("Error: ", err); })
});



// |--------------------------- Helper Functions! ---------------------------|

/**
* This helper function creates a new user and saves them to mongo.
* Take notice of how isPending is set to true here due to our implimentation of
* how/when Users are stored in mongo.
*
* @param date     the date of the reminder
* @param subject  the subject of the reminder
* @param userId   the id of the user we are searching for
*/
function saveUserAsPending(date, subject, userId){
  var newUser = new User({
    slackId: userId,
    isPending: true,
    subject: subject,
    date: date,
  });
  newUser.save(function(err, savedUser){
    if(err){
      console.log("error saving new user", err);
      return;
    }
    console.log(`User ${userId} succesfully saved in db!`);
  });
}

function extractInfoFromResp(resp) {
  var invitees = resp.data.result.parameters.invitees;
  var date = resp.data.result.parameters.date;
  var time = resp.data.result.parameters.time;
  var duration = resp.data.result.parameters.duration; // this is a String
  var subject = resp.data.result.parameters.subject || 'No Subject';
  var location = resp.data.result.parameters.subject || 'No Location';
  return {invitees, date, time, duration, subject, location};
}

function apiAiQuery(msg) {
  return axios.get('https://api.api.ai/api/query', {
    params: {
      v: 20150910,
      query: msg.text,
      lang: 'en',
      sessionId: msg.user,
      timezone: '2017-07-17T20:19:32-0700',
    },
    headers: {
      Authorization: `Bearer ${process.env.API_AI_TOKEN}`,
    },
  })
}

/**
* This function checks if the user is sending a msg to the bot via slack direct msg
*
* @param dm
* @param msg
* @return boolean
*/
function isDirectMessage(dm, msg) {
  return dm && (dm.id === msg.channel) && (msg.type === 'message')
}

/**
* Helper Function: Create a new user with a slackId and a channel
*/
function createNewUser(user, slackId, channel){
  if(!user) {
    return new User({
      slackId: slackId,
      slackDmId: channel ,
      isPending: false
    }).save()
  }
  return user;
}

/**
* This helper function fetchs the user from mongo and sets their isPending status to true.
* This allows us to easily keep track of user/bot progress in their interactions
*
* @param date     the date of the reminder
* @param subject  the subject of the reminder
* @param userId   the id of the user we are searching for
*/
function updateUserAsPending(date, subject, userId){
  User.findOne({slackId: userId})
  .exec(function(err, foundUser){
    foundUser.isPending = true;
    foundUser.subject = subject;
    foundUser.date = date;
    // foundUser.description = `Meeting with ${data.result.}`
    foundUser.save(function(err, savedUser){
      if(err){
        console.log('error saving user', err);
      }else{
        console.log('user successfully updated as pending');
      }
    });
  });
}
//TESTt
// update User for Event
// var info = {invitees, date, time, duration, subject, location};
function updateUserAsPendingForEvent(info, userId, users){
  console.log(users);
  User.findOne({slackId: userId})
  .exec(function(err, foundUser){
    foundUser.isPending = true;
    foundUser.date = info.date + "T" + info.time + "-07:00";
    foundUser.subject = info.subject;
    foundUser.users = users;
    foundUser.save()
      .then(() => {
        console.log('successfully updated user as pending');
        console.log(info);
        var newEvent = new Event({
          userId: foundUser._id,
          eventInfo: info
        });
        return newEvent.save();
      })
      .then(() => {

        console.log('new event successfully saved');
      })
      .catch((err) => {
        console.log("error in updateUserAsPendingForEvent", err);
      });
  });
}

/**
* Helper Function: this function displays an interactive msg to the user in
* order to either confirm or deny adding a reminder to Google Calendar
*
* @param channelId The ID of the slack channel the user is in when talking to the bot.
*/
function postInteractiveMessage(date, subject, channelId) {
  web.chat.postMessage(channelId,
    `Creating reminder for '${subject}' on ${date}`,
    {
      "attachments": [
        {
          "fallback": "You are unable to confirm the reminder",
          "callback_id": "reminder",
          "color": "#3AA3E3",
          "attachment_type": "default",
          "actions": [
            {
              "name": "confirm",
              "text": "Confirm",
              "type": "button",
              "value": "true"
            },
            {
              "name": "confirm",
              "text": "Cancel",
              "type": "button",
              "value": "false"
            }
          ]
        }
      ]
    });
  }

  function postInteractiveMessageForEvent(info, channelId) {
    var people = info.invitees.join(', ');
    web.chat.postMessage(channelId,
      `Creating meeting with ${people} at ${info.location} on ${info.date} at ${info.time} for ${info.duration} minutes`,
      {
        "attachments": [
          {
            "fallback": "You are unable to confirm the meeting",
            "callback_id": "meeting",
            "color": "#3AA3E3",
            "attachment_type": "default",
            "actions": [
              {
                "name": "confirm",
                "text": "Confirm",
                "type": "button",
                "value": "true"
              },
              {
                "name": "confirm",
                "text": "Cancel",
                "type": "button",
                "value": "false"
              }
            ]
          }
        ]
      });
    }

  /**
  * Helper Function: sends a msg to the user letting them know they need
  * to confirm or deny the "add reminder"
  *
  * @param channelId The ID of the slack channel the user is in when talking to the bot.
  */
  function postWarningMessage(channelId){
    web.chat.postMessage(channelId, `:grinning: You're awesome! Please respond to the button above! :grinning:`);
  }
