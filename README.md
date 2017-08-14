# Slack Butler Bot

The Slack Butler Bot makes scheduling meetings between slack team members more efficent by allowing them to enter the
events as text, which adds the meeting to google calendar.

## Learning Objective

To learn how to combine multiple APIs in order to better understand how real world applications talk to each other.

## Built using...

* Google Calendar API
* API.ai
* Slack API
* MongoDB (Backend storage)
* Express server
* Axios requests
* Google Oauth

## Data Flow

![Alt text](./diagram1.png?raw=true "Data Flow for Slack Bot")

## Technical Challenges

1. Working with multiple APIs: 
        The most challenging aspect of working with multiple APIs is understanding
        how to set up a data flow which allows these APIs to talk to each other effectively. When we were coding, 
        we would often need to double check which API the data needs to be sent to as well as which API data is coming
        from.
 
2. Managing state: 
        Managing state in the application was difficult because we needed to make sure the user is logged
        into a google account before the bot could take any action.  Secondly, it was troublesome handing the response based           on the which part of the conversation the user was in with the bot.
        Ex. If the user types, "Schedule a meeting", the reponse should be, "with who?".  As opposed to if the user types in,
        "Schedule a meeting with Evan at 8 pm tomorrow", the response should be a confirmation to create the meeting.

3. Asynchronous code: 
        This was the first time we had to HEAVILY use async code (Google API, Slack Web API and API.ai). The trouble                   came in making sure we waited for a response before executing code that would depend on data from async calls.

4. Working as a team: 
        through this project we have a better understanding of production level work flow.  Assigning each other different             tasks to work on at the same time proved difficult because we needed to heavily rely on each others code (of                   which we may not know exactly how it works). Having a general sense of how code works was a frustrating experience             but it was a fantastic way to introduce us to a real work enviornment.
     

## Authors / Acknowledgments

* ** Evan Peterson | Jatharsan Param | Donovan So **

