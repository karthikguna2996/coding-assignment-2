let express = require("express");
let app = express();
app.use(express.json());
let { open } = require("sqlite");
let sqlite3 = require("sqlite3");
let path = require("path");
let dbPath = path.join(__dirname, "twitterClone.db");
let bcrypt = require("bcrypt");
let jwt = require("jsonwebtoken");
let db = null;

let connectDatabase = async () => {
  try {
    db = await open({
      filename: dbPath,
      driver: sqlite3.Database,
    });
    app.listen(3003, () => {
      console.log("server started");
    });
  } catch (err) {
    console.log(`there is an ${err.message}`);
    process.exit(1);
  }
};
connectDatabase();

app.post("/register/", async (request, response) => {
  let { username, password, name, gender } = request.body;
  console.log(username);
  let getUserQuery = `
          SELECT *
          FROM user
          WHERE username = '${username}'
     `;
  let dbUser = await db.get(getUserQuery);
  console.log(dbUser);
  if (dbUser === undefined) {
    let hashPass = await bcrypt.hash(password, 10);

    if (`${password}`.length < 6) {
      response.status(400);
      response.send("Password is too short");
    } else {
      let postQuery = `
                 INSERT INTO user(name,username,password,gender)
                 VALUES ('${name}','${username}','${hashPass}','${gender}')
                 `;
      await db.run(postQuery);
      response.status(200);
      response.send("User created successfully");
    }
  } else {
    if (dbUser.username === username) {
      response.status(400);
      response.send("User already exists");
    }
  }
});

app.post("/login/", async (request, response) => {
  let { username, password } = request.body;
  let getQueryLogin = `
           SELECT *
           FROM user
           WHERE username = '${username}'
    `;
  let userExist = await db.get(getQueryLogin);
  if (userExist === undefined) {
    response.status(400);
    response.send("Invalid user");
  } else {
    let passwordValid = await bcrypt.compare(password, userExist.password);

    if (passwordValid === false) {
      response.status(400);
      response.send("Invalid password");
    } else {
      let payload = { username: username };
      let jwtToken = jwt.sign(payload, "MY_SECRET_KEY");
      response.send({ jwtToken });
    }
  }
});

let middleWareFunction = (request, response, next) => {
  let jwtToken;
  let authHeader = request.headers["authorization"];
  if (authHeader !== undefined) {
    jwtToken = authHeader.split(" ")[1];
  }
  console.log(jwtToken);
  if (jwtToken !== undefined) {
    jwt.verify(jwtToken, "MY_SECRET_KEY", async (error, payload) => {
      if (error) {
        console.log(payload);
        response.status(401);
        response.send("Invalid JWT Token");
      } else {
        console.log(payload);
        request.username = payload.username;
        next();
      }
    });
  } else {
    response.status(401);
    response.send("Invalid JWT Token");
  }
};

app.get("/user/tweets/feed/", middleWareFunction, async (request, response) => {
  let username = request.username;
  let userIdQuery = `select user_id from user where username = '${username}'`;
  let getUserId = await db.get(userIdQuery);
  let userId = getUserId.user_id;

  let getQuery1 = `SELECT user.username,tweet.tweet,tweet.date_time AS dateTime
                         FROM (follower INNER JOIN tweet ON follower.following_user_id = tweet.user_id) AS t JOIN user ON t.user_id = user.user_id
                         WHERE t.follower_user_id = '${userId}'
                         ORDER BY t.date_time DESC
                         LIMIT 4
                               
      `;
  let getResponse1 = await db.all(getQuery1);
  response.send(getResponse1);
});

app.get("/user/following/", middleWareFunction, async (request, response) => {
  let username = request.username;
  let userIdQuery = `select user_id from user where username = '${username}'`;
  let getUserId = await db.get(userIdQuery);
  let userId = getUserId.user_id;
  let getQuery2 = `
          SELECT name
          FROM follower INNER JOIN user ON follower.following_user_id = user.user_id
          WHERE follower.follower_user_id = '${userId}'
      `;
  let getResponse2 = await db.all(getQuery2);
  response.send(getResponse2);
});

app.get("/user/followers/", middleWareFunction, async (request, response) => {
  let username = request.username;
  let userIdQuery = `select user_id from user where username = '${username}'`;
  let getUserId = await db.get(userIdQuery);
  let userId = getUserId.user_id;
  let getQuery3 = `
           SELECT name
          FROM follower INNER JOIN user ON follower.follower_user_id = user.user_id
          WHERE follower.following_user_id = '${userId}'
      
  `;
  let getResponse3 = await db.all(getQuery3);
  response.send(getResponse3);
});

app.get("/tweets/:tweetId/", middleWareFunction, async (request, response) => {
  let username = request.username;
  let userIdQuery = `select user_id from user where username = '${username}'`;
  let getUserId = await db.get(userIdQuery);
  let userId = getUserId.user_id;
  let { tweetId } = request.params;
  let tweetUserQuery = `
          SELECT user_id
          FROM tweet
          WHERE tweet_id = ${tweetId}
          
  `;
  let tweetUserIdResponse = await db.get(tweetUserQuery);
  let tweetUserId = tweetUserIdResponse.user_id;
  let isUserFollowingQuery = `
      SELECT *
      FROM follower
      WHERE follower_user_id = ${userId} AND following_user_id = ${tweetUserId}
  `;
  let isUserFollowing = await db.get(isUserFollowingQuery);
  console.log(isUserFollowing);

  if (isUserFollowing === undefined) {
    response.status(401);
    response.send("Invalid Request");
  } else {
    let likesQuery = `
     SELECT COUNT(like_id) AS likes
     FROM like
     WHERE tweet_id = ${tweetId}

    `;
    let { likes } = await db.get(likesQuery);
    let getQuery4 = `
          SELECT t.tweet,${likes} AS likes,COUNT(t.reply_id) AS replies,tweet.date_time AS dateTime
          FROM (tweet INNER JOIN reply ON tweet.tweet_id = reply.tweet_id) as t
          GROUP BY t.tweet_id
          HAVING t.tweet_id = ${tweetId}
      `;
    let getResponse4 = await db.get(getQuery4);
    console.log(getResponse4);
    response.send(getResponse4);
  }
});

app.get(
  "/tweets/:tweetId/likes/",
  middleWareFunction,
  async (request, response) => {
    let username = request.username;
    let userIdQuery = `select user_id from user where username = '${username}'`;
    let getUserId = await db.get(userIdQuery);
    let userId = getUserId.user_id;
    let { tweetId } = request.params;
    let tweetUserQuery = `
          SELECT user_id
          FROM tweet
          WHERE tweet_id = ${tweetId}
          
  `;
    let tweetUserIdResponse = await db.get(tweetUserQuery);
    let tweetUserId = tweetUserIdResponse.user_id;
    let isUserFollowingQuery = `
      SELECT *
      FROM follower
      WHERE follower_user_id = ${userId} AND following_user_id = ${tweetUserId}
  `;
    let isUserFollowing = await db.get(isUserFollowingQuery);
    console.log(isUserFollowing);

    if (isUserFollowing === undefined) {
      response.status(401);
      response.send("Invalid Request");
    } else {
      let getQuery5 = `
         SELECT username
         FROM like INNER JOIN user ON like.user_id = user.user_id
         WHERE tweet_id = ${tweetId} 
      `;
      let getResponse5 = await db.all(getQuery5);
      let userLikesList = getResponse5.map((val) => {
        return val.username;
      });
      response.send({ likes: userLikesList });
    }
  }
);

app.get(
  "/tweets/:tweetId/replies/",
  middleWareFunction,
  async (request, response) => {
    let username = request.username;
    let userIdQuery = `select user_id from user where username = '${username}'`;
    let getUserId = await db.get(userIdQuery);
    let userId = getUserId.user_id;
    let { tweetId } = request.params;
    let tweetUserQuery = `
          SELECT user_id
          FROM tweet
          WHERE tweet_id = ${tweetId}
          
  `;
    let tweetUserIdResponse = await db.get(tweetUserQuery);
    let tweetUserId = tweetUserIdResponse.user_id;
    let isUserFollowingQuery = `
      SELECT *
      FROM follower
      WHERE follower_user_id = ${userId} AND following_user_id = ${tweetUserId}
  `;
    let isUserFollowing = await db.get(isUserFollowingQuery);
    console.log(isUserFollowing);

    if (isUserFollowing === undefined) {
      response.status(401);
      response.send("Invalid Request");
    } else {
      let getQuery6 = `
         SELECT name,reply
         FROM reply inner join user ON user.user_id = reply.user_id
         WHERE tweet_id = ${tweetId}
        `;
      let getResponse6 = await db.all(getQuery6);
      response.send({ replies: getResponse6 });
    }
  }
);

app.get("/user/tweets/", middleWareFunction, async (request, response) => {
  let username = request.username;
  let userIdQuery = `select user_id from user where username = '${username}'`;
  let getUserId = await db.get(userIdQuery);
  let userId = getUserId.user_id;

  let likesQuery = `
         SELECT tweet.tweet,COUNT(Like_id) AS likes
         FROM tweet JOIN like ON like.tweet_id = tweet.tweet_id
         WHERE tweet.user_id = ${userId}
         GROUP BY tweet.tweet_id
    `;
  let likes = await db.all(likesQuery);
  console.log(likes);

  let repliesQuery = `
        SELECT tweet.tweet ,COUNT(reply_id) AS replies,tweet.date_time AS dateTime
        FROM tweet JOIN reply ON tweet.tweet_id = reply.tweet_id
        WHERE tweet.user_id = ${userId}
        GROUP BY tweet.tweet_id

    `;
  let replies = await db.all(repliesQuery);
  console.log(replies);
  let ansList = [];
  for (let i of replies) {
    for (let j of likes) {
      if (i.tweet === j.tweet) {
        ansList.push({
          tweet: i.tweet,
          likes: j.likes,
          replies: i.replies,
          dateTime: i.dateTime,
        });
      }
    }
  }
  console.log(ansList);
  response.send(ansList);
});

app.post("/user/tweets/", middleWareFunction, async (request, response) => {
  let { tweet } = request.body;
  let postQuery = `
                    INSERT INTO tweet(tweet)
                    VALUES ('${tweet}')
                 `;
  await db.run(postQuery);
  response.send("Created a Tweet");
});

app.delete(
  "/tweets/:tweetId/",
  middleWareFunction,
  async (request, response) => {
    let { tweetId } = request.params;
    let username = request.username;
    let userIdQuery = `select user_id from user where username = '${username}'`;
    let getUserId = await db.get(userIdQuery);
    let userId = getUserId.user_id;
    let isUserTweetedQuery = `
         SELECT *
         FROM tweet JOIN user ON tweet.user_id = user.user_id
         WHERE user.user_id = ${userId} AND tweet_id = ${tweetId}
    `;
    let isUserTweeted = await db.get(isUserTweetedQuery);
    if (isUserTweeted === undefined) {
      response.status(401);
      response.send("Invalid Request");
    } else {
      let deleteQuery = `
           DELETE FROM tweet
           WHERE tweet_id = ${tweetId}
    `;
      await db.run(deleteQuery);
      response.send("Tweet Removed");
    }
  }
);

module.exports = app;
