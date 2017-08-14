/**
 * This function will search our mongoDB for reminders that are due today and tomorrow.
 * and send messages to all the users with reminders using the Slack RTM API
 */
var Reminder = require('../models/models').Reminder;
var mongoose = require('mongoose');

var WebClient = require('@slack/client').WebClient;
var RTM_EVENTS = require('@slack/client').RTM_EVENTS;
var webToken = process.env.SLACK_BOT_TOKEN || '';
var web = new WebClient(webToken);


// set up db
mongoose.connection.on('error', function() {
  console.log('Error connecting to database');
});
mongoose.connection.on('connected', function(){
  console.log('Successfully connected to database');
});
mongoose.connect(process.env.MONGODB_URI);

var today = new Date();
var tomorrow = new Date();
tomorrow.setDate(today.getDate() + 1);
var todayStr = today.toISOString().slice(0,10).replace(/-/g,"-");

 function findDueReminders(){
   // Get all the reminders
   Reminder.find({})
    .populate('userId')
    .exec(function(err, reminders) {
        if(err){
          console.log("sorry, error occured: ", err);
          return;
        }
         console.log('Today is', today.toDateString());
         console.log('Tomorrow is', tomorrow.toDateString());
         // filter reminders
         var tomorrowReminders = reminders.filter(function(item) {
            var reminderDate = new Date(item.date);
            // reminderDate.setDate(reminderDate.getDate() + 1);
            return tomorrow.toDateString() === reminderDate.toDateString();
         });

         var todayReminders = reminders.filter(function(item) {
             var reminderDate = new Date(item.date);
            //  reminderDate.setDate(reminderDate.getDate() + 1);
             console.log('remidner date', reminderDate.toDateString());
             return today.toDateString() === reminderDate.toDateString();
         });
         console.log("Today Reminders: ", todayReminders);
         console.log("Tomorrow Reminders: ", tomorrowReminders);
         var promiseArr1 = sendTodayReminders(todayReminders);
         var promiseArr2 = sendTomorrowReminders(tomorrowReminders);
         var combinedPromiseArr = promiseArr1.concat(promiseArr2);
         Promise.all(combinedPromiseArr)
          .then(result => (Reminder.deleteMany({date: todayStr})))
          .then(() => {
            console.log('successfully deleted reminders, killing process');
            process.exit(0);
          })
          .catch((err) => console.log('error deleting reminders', err));
      });
 }

 function sendTodayReminders(todayReminders) {
   console.log('sending today reminders');
   var arr = todayReminders.map(function(reminder) {
     return web.chat.postMessage(reminder.userId.slackDmId, `You have a reminder for an all day event ${reminder.subject} today (${reminder.date})`);
   });
   return arr;
 }


 function sendTomorrowReminders(tomorrowReminders) {
   console.log('sending tomorrow reminder');
   var arr = tomorrowReminders.map(function(reminder) {
     return web.chat.postMessage(reminder.userId.slackDmId, `You have a reminder for an all day event ${reminder.subject} tomorrow (${reminder.date})`);
   });

   return arr;
 }


findDueReminders();
