calendar.events.insert({
  auth: tempOauth,
  calendarId: 'primary',
  resource: event,
}, function(err, event) {
  if(err) {
    console.log('There was an error creating the event', err);
  }
  // attendee stuff
  var usersToGet = foundUser.users;
  //Loop
  var promiseUserArr = usersToGet.map((person) => {
    // Search for them in mongo
    return User.findOne({slackId: person.slackId});
  })

  Promise.all(promiseUserArr)
    .then((resp) => {
      // Get all the user tokens
        var tokenObjs = resp.map((user) => {
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
              var startTime = moment(foundUser.date).subtract(7, "hours").format(); // ASK MOOSE ABOUT THIS SHIT

              var endTime = moment(foundUser.date).add(30, "minutes").subtract(7, "hours").format();
              // Iterate over the events and check for a matching date and time
              events.items.forEach(function(event) {
                // check if the event is the same day
                console.log("Event: " , event.start);
                console.log("Our start time: ", startTime.split("T")[0]);
                if(!event.start.date && (event.start.dateTime.split("T")[0] === startTime.split("T")[0])) {
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

                  }

                }
              })

            }
          })
        })
        res.send('Scheduled your event!' + event.htmlLink);
    })
})
