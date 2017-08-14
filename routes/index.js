var express = require('express');
var router = express.Router();
var User = require('../models/models').User;
var Reminder = require('../models/models').Reminder;
var moongoose = require('mongoose');

var moment = require('moment');   // For dealing with JS time stuff

// Google Authentication
var google = require('googleapis');
var OAuth2 = google.auth.OAuth2;

// Google Calendar
var calendar = google.calendar('v3');

// The scope of our Google authentication as an array.
const GOOGLE_SCOPE = [
  'https://www.googleapis.com/auth/userinfo.profile',
  'https://www.googleapis.com/auth/calendar'
]

// '/' route renders a barebones home page
router.get('/', function(req, res, next) {
  res.render('index', { title: 'Express' });
});


/**
 * This route makes a POST request to '/slack/interactive' when we interact with our slackbot.
 * We search for the user who is interacting with our bot, and attempt to update their current
 * pending state and save it to MongoDB. (ngrock url: http://6ecb3094.ngrok.io/slack/interactive)
 *
 * @method POST
 * @param route
 * @param callback
 */
router.post('/slack/interactive', function(req, res){
  var payload = JSON.parse(req.body.payload);
  console.log('payload', payload);

  User.findOne({slackId: payload.user.id})                // Store the User's current pending state
    .exec(function(err, foundUser) {
      if(payload.callback_id === 'reminder') {
        updatePendingState(foundUser, payload, res);             // Helper Function to abstract away updating
      } else {
        updatePendingStateForEvent(foundUser, payload, res);
      }
    });
});

/**
 * This route makes a GET request to '/connect' when the bot detects that we have not yet been
 * authenticated through Google. We search for the user by id in mongo and if found, a generated url
 * will take the user to authenticate their account.
 *
 * @method POST
 * @param route
 * @param callback
 */
router.get('/connect', function(req, res) {
  console.log("INSIDE /connect");
  var { userId } = req.query;
  if(! userId ) { res.status(400).send('Missing user id'); }
    User.findById(userId)
    .then(function(user){
      if(!user) { res.status(404).send('Cannot find user'); }
        var googleAuth = getGoogleAuth();
        var url = googleAuth.generateAuthUrl({
          access_type: 'offline',
          prompt: 'consent',
          scope: GOOGLE_SCOPE,
          state: userId
        });
        res.redirect(url);
    })
});

/*
 * This route is hit after the user has attempted to authenticate their account through Google.
 * If authentication is successful, we send a response, "You are connected to Google Calendar", and
 * and error msg otherwise.
 *
 * @method GET
 * @param route
 * @param callback
 */
router.get('/connect/callback', function(req, res) {
  var googleAuth = getGoogleAuth();                             // Get Google authentication on connect
  googleAuth.getToken(req.query.code, function(err, tokens) {   // API call to Google; get the token with our credentials
    if(err) { res.status(500).json({error: err}); }             // Error Handling
    googleAuth.setCredentials(tokens);                          // Send in the tokens
    var plus = google.plus('v1');
    plus.people.get({auth: googleAuth, userId: 'me'}, function(err, googleUser) {
      if(err) { res.status(500).json({error: err}); }
        User.findById(req.query.state)
          .then(function(mongoUser) {
            mongoUser.google = tokens;
            mongoUser.google.profile_id = googleUser.id;
            mongoUser.google.profile_name = googleUser.displayName;
            return mongoUser.save();
          })
          .then(function(mongoUser) {
            res.send('You are connected to Google Calendar');
            rtm.sendMessage('You are now connected to Google Calendar', slack);         //<----- never hits this!
          });
      });
  });
});

//                  |---------------------- Helper Functions! ------------------------|
/**
* Helper Function: this function abstracts away the updating of the user state
* from our route: '/slack/interactive' and sending a response back to display to the user in slack
*
* @param foundUser the user we found when searching mongo
* @param payload   the payload from req.body.payload in our route
* @param res       the response we will call .send() on from our route
*/
function updatePendingState(foundUser, payload, res) {
  foundUser.isPending = false;
  foundUser.save(function(err, savedUser) {
    if(err) {
      console.log("error saving user", err);
      res.status(500).send("Database Error");
      return;
    }
    console.log('updated user!');
    if(payload.actions[0].value === 'true') {
      var tempOauth = getGoogleAuth();
      tempOauth.setCredentials({
        access_token: foundUser.google.access_token,
        refresh_token: foundUser.google.refresh_token,
      })
      var event = getIntentMsg(payload, foundUser);
      calendar.events.insert({
        auth: tempOauth,
        calendarId: 'primary',
        resource: event,
      }, function(err, event){
        if(err){
          console.log('There was an error creating the event', err);
        }else{
          console.log('Event created: %s', event.htmlLink);
          storeReminder(foundUser)
            .then(savedReminder => {
              console.log('saved reminder', savedReminder);
              res.send('Created reminder' + event.htmlLink);
            })
            .catch(err => {
              console.log('error saving', err);
            });
        }
      })
    } else {
      res.send('Canceled it');
    }
  });
}

function updatePendingStateForEvent(foundUser, payload, res) {
  foundUser.isPending = false;
  foundUser.save(function(err, savedUser) {
    if(err) {
      console.log("error saving user", err);
      res.status(500).send("Database Error");
      return;
    }
    // Determine if the event is a meeting or an all day event

    if(payload.actions[0].value === 'true') {

      // Check if there is a time conflict
      // attendee stuff
      var usersToGet = foundUser.users;
      console.log("USERS TO GET ---> ", usersToGet);
      //Loop
      var promiseUserArr = usersToGet.map((person) => {
        // Search for them in mongo
        return User.findOne({slackId: person.slackId});
      })


      Promise.all(promiseUserArr)
        .then((resp) => {
          // Get all the user tokens
            var tokenObjs = resp.map((user) => {
              console.log("User: --->", user);
              console.log("");
              return {
                access_token: user.google.access_token,
                refresh_token: user.google.refresh_token,
              }
            });

            // Get tokens

            tokenObjs.forEach((tokenObj) => {
              //Set the credentials
              var googleAuth = getGoogleAuth();
              googleAuth.setCredentials(tokenObj);
              // get the user calendar event list
              calendar.events.list({
                auth: googleAuth,
                calendarId: 'primary',
                timeMin: moment().format(),
              }, function(err, events) {
                if(err) {
                  console.log('There was an error creating the event', err);
                } else {
                  // check for conflicts
                  console.log("FOUND USER.DATE: --->>>>> ", foundUser.date);
                  var startTime = moment(foundUser.date).subtract(7, "hours").format(); // ASK MOOSE ABOUT THIS SHIT

                  var endTime = moment(foundUser.date).add(30, "minutes").subtract(7, "hours").format();

                  // Iterate over the events and check for a matching date and time
                  events.items.forEach(function(event, index) {
                    // check if the event is the same day
                    console.log("event.start.dateTime.split(T)[0]: " , event.start.dateTime.split("T")[0]);
                    console.log("startTime.split(T)[0]",startTime.split("T")[0]);
                    console.log("event.start.dateTime ", event.start);
                    console.log("IF STATEMENT CONDITION ====== ", event.start.dateTime.split("T")[0] === startTime.split("T")[0]);
                    if(event.start.dateTime && (event.start.dateTime.split("T")[0] === startTime.split("T")[0])) {
                      console.log("INSIDE IF>>>>>>>>>>>>>>>>>>>>>>");
                      // index 3 -> hours, index 4 --> minutes
                      var eventStartTime = (moment(event.start.dateTime).subtract(7, "hours").hour() * 100) + moment(event.start.dateTime).minute();
                      var eventEndTime = (moment(event.end.dateTime).subtract(7, "hours").hour() * 100) + moment(event.end.dateTime).minute();
                      var ourStartTime = (moment(startTime).hour() * 100) + moment(startTime).minute();
                      var ourEndTime = (moment(endTime).hour() * 100) + moment(endTime).minute();
                      console.log("HOUR: ", moment(startTime).hour());
                      // Check for the time conflict
                      if(isTimeConflict(eventStartTime, eventEndTime, ourStartTime, ourEndTime)){
                        // since this is a time conflict, we need to tell the user the time cant be scheduled,
                        // and give them options for alternate times
                        res.send("There is a time conflict!  Meeting not scheduled!");
                      }
                      // insert into their calendar
                      var event = getIntentMsg(payload, foundUser);
                      calendar.events.insert({
                        auth: googleAuth,
                        calendarId: 'primary',
                        resource: event,
                      }, function(err, event) {
                        if(err) {
                          console.log("There was an Error: " , err);
                        }
                        // set credentials for our user
                        var tempOauth = getGoogleAuth();
                        tempOauth.setCredentials({
                          access_token: foundUser.google.access_token,
                          refresh_token: foundUser.google.refresh_token,
                        })
                        var event = getIntentMsg(payload, foundUser);
                        calendar.events.insert({
                          auth: tempOauth,
                          calendarId: 'primary',
                          resource: event,
                        }, function(err, event) {
                            if(err) {
                              console.log("There was an error creating the event!" , err);
                            } else {
                              res.send("Scheduled your event!!!!!" + event.htmlLink);
                            }
                        })
                      })
                    }
                  })
                }
              })
            })
        })
    } else {
      res.send('Canceled it');
    }
  });
}

/**
 * Helper function to determine if there is a time conflict.
 * This function assumes you pass in times in the following way:
 * 9:00 am --> 900(integer), 1:00 pm --> 1300(integer)
 *
 * @param eventStartTime the start time of the event found on their Calendar
 * @param ourStartTime   the start time of the event we want to post to their Calendar
 * @param ourEndTime     the end time of the event we want to post to
 */
function isTimeConflict(eventStartTime, eventEndTime, ourStartTime, ourEndTime){

  // Testing the passed in stuff
  console.log("Event Start Time: ", eventStartTime);
  console.log("Event End Time: ", eventEndTime);
  console.log("Our start time: ", ourStartTime);
  console.log("Our end time: ", ourEndTime);

   if (eventStartTime < ourEndTime) {
     if (eventStartTime >= ourStartTime) {
       console.log("There is a time conflict! =(");
       return true; // time conflict
     }

     if(eventEndTime >= ourStartTime) {
         console.log("There is a time conflict! =(");
         return true
     }
   }
   console.log("There is NO time conflict! =)");
   return false; // No conflict found so return false
}

function getIntentMsg(payload, foundUser) {
  var intentName = payload.callback_id;
  switch (intentName) {
    case 'reminder':
      return {
          summary: foundUser.subject,
          description: foundUser.subject + ": " + foundUser.google.profile_name,
          start: {
            date: foundUser.date,
            timeZone: 'America/Los_Angeles'
          },
          end: {
            date: foundUser.date,
            timeZone: 'America/Los_Angeles'
          },
      }
    case 'meeting':
      return {
        summary: foundUser.subject,
        description: foundUser.subject + ": " + foundUser.google.profile_name,
        attendees: foundUser.users,
        start: {
          dateTime: moment.utc(foundUser.date),
          timeZone: 'America/Los_Angeles',
        },
        end: {
          dateTime: moment.utc(foundUser.date).add(30, 'minutes'),     // TODO for now events will be 30 minutes long
          timeZone: 'America/Los_Angeles',
        },
      }
    default:
      return "No intent found!";
  }
}

// !!!!!!
function storeReminder(foundUser) {
  var newReminder = new Reminder({
    userId: foundUser._id,
    subject: foundUser.subject,
    date: foundUser.date,
  });
  return newReminder.save()
}

/**
 * Helper Function: this function pulls our authentication info from a local source and
 * sets up a new OAuth2 client
 *
 * @return a new OAuth2 client
 */
function getGoogleAuth(){
  var oauth2Client = new OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.DOMAIN + 'connect/callback'
  )
  return oauth2Client;
}

module.exports = router;
