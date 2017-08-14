/**
* -------------------------------------------------------------------
* This file will serve as our mongodb Schema and Model definitions
* -------------------------------------------------------------------
*/
var mongoose = require('mongoose');
var Schema = mongoose.Schema;

/**
* User Schema
* slackId:    string needed to identify the user
* subject:    our task we will be adding to google calendar
* date:      TODO
* isPending:  so we know if the user has finished an interaction with the bot
* slackDmId:  string needed to identify the dm the user is in
* google:     object which is populated with google auth info after authentication
*/
var User = mongoose.model('User', {
  slackId: {
    type: String,
    required: true
  },
  subject: String,
  date: String,
  users: {
    type: Array,
  },
  isPending: {
    type: Boolean,
    default: false,
  },
  slackDmId: {
    type: String,
    required: true
  },
  google: {},
});

/**
* Reminder Schema
* userId:   string needed to identify the user to which this reminder belongs
* subject:  the subject of this reminder
* date:     the date in which the user set this reminder to
*/
var Reminder = mongoose.model('Reminder', {
  userId: {
    type: Schema.ObjectId,                   // Change this to Schema._id so we can use .populate() later
    required: true,
    ref: 'User',
  },
  subject: {
    type: String,
    required: true,
  },
  date: {
    type: String,
    required: true,
  },
});

var Event = mongoose.model('Event', {
  userId: {
    type: Schema.ObjectId,
    ref: 'User',
  },
  eventInfo: {},
})


// Export our models!
module.exports = {
  User: User,
  Reminder: Reminder,
  Event: Event
};
