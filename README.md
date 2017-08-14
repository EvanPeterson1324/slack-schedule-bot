# Slack Butler Bot

The Slack Butler Bot makes scheduling meetings between slack team members more efficent by allowing them to enter the
events as text, which adds the meeting to google calendar.

## Built using...

* Google Calendar API
* API.ai
* Slack API
* MongoDB (Backend storage)
* Express server
* Axios requests
* Google Oauth

## Learning Points
Design Process
    
Google Vision API
  The API here was essential for realizing our vision of identifying what was in the pictures that our users took. What ended up being the most challenging part of it was getting it set up with the Google Vision Client, truthfully. Authentication required more than 8 keys and many tokens. G Cloud was hard to decipher. Once Google Vision was set up, we had to filter through the keywords that it gave us based on the image. If 'food' or 'beverage' was in the list, we allowed the image to be sent. 
  
Storage
  None of us had ever had to store images so it was a learning curve to find out that we needed to also use AWS on top of MongoDB. MongoDB only stores JSON objects and documents up to 16mb — image files are much bigger than that. Once we got the post request of the image that the user took, we stored it in AsynchStorage then sent it out to AWS cloud storage. 

## Authors / Acknowledgments

* ** Evan Peterson | Ryan Clyde | Carlie Ostrom | Audrey Setiadarma **

