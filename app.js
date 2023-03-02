const express = require("express");
const { open } = require("sqlite");
const sqlite3 = require("sqlite3");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const app = express();
app.use(express.json());

const path = require("path");
const dbPath = path.join(__dirname, "twitterClone.db");

let db = null;

const initializeDBAndServer = async () => {
  try {
    db = await open({
      filename: dbPath,
      driver: sqlite3.Database,
    });
    app.listen(3000, () => {
      console.log("Server is running at http:/localhost:3000/");
    });
  } catch (e) {
    console.log(`Error message: ${e.message}`);
  }
};

initializeDBAndServer();

function authenticateToken(request, response, next) {
  const { tweet } = request.body;
  const { tweetId } = request.params;
  let jwtToken;
  const authHeader = request.headers["authorization"];
  if (authHeader !== undefined) {
    jwtToken = authHeader.split(" ")[1];
  }
  if (jwtToken === undefined) {
    response.status(401);
    response.send("Invalid JWT Token");
  } else {
    jwt.verify(jwtToken, "hari", async (error, payload) => {
      if (error) {
        response.status(401);
        response.send("Invalid JWT Token");
      } else {
        request.payload = payload;
        next();
      }
    });
  }
}

app.post("/register/", async (request, response) => {
  const { username, password, name, gender } = request.body;
  const getUsername = `SELECT * FROM user
  WHERE username='${username}';`;
  const usernameExists = await db.get(getUsername);
  if (usernameExists !== undefined) {
    response.status(400);
    response.send("User already exists");
  } else {
    if (password.length < 6) {
      response.status(400);
      response.send("Password is too short");
    } else {
      const hashedPassword = await bcrypt.hash(password, 10);
      const insertQuery = `
            INSERT INTO user(username,password,name,gender)
            VALUES( '${username}','${hashedPassword}','${name}','${gender}');`;
      await db.run(insertQuery);
      response.status(200);
      response.send("User created successfully");
    }
  }
});

app.post("/login/", async (request, response) => {
  const { username, password } = request.body;
  const getUsername = `SELECT * FROM user
    WHERE username='${username}';`;
  const dbUser = await db.get(getUsername);
  if (dbUser === undefined) {
    response.status(400);
    response.send("Invalid user");
  } else {
    const isPasswordMatched = await bcrypt.compare(password, dbUser.password);
    if (isPasswordMatched === true) {
      const payload = {
        username: username,
      };
      const jwtToken = jwt.sign(dbUser, "hari");
      response.send({ jwtToken });
    } else {
      response.status(400);
      response.send("Invalid password");
    }
  }
});
app.get("/user/tweets/feed/", authenticateToken, async (request, response) => {
  const { payload } = request;
  const { user_id, name, username, gender } = payload;
  console.log(name);
  const getTweetQuery = `
    SELECT 
      username,tweet,date_time AS dateTime
    FROM follower INNER JOIN tweet
    ON follower.following_user_id = tweet.user_id
    INNER JOIN user ON follower.following_user_id=user.user_id
    WHERE follower.follower_user_id =${user_id}
    ORDER BY dateTime DESC
    LIMIT 4;`;
  const tweets = await db.all(getTweetQuery);
  response.send(tweets);
});

app.get("/user/following/", authenticateToken, async (request, response) => {
  const { payload } = request;
  const { user_id, name, username, gender } = payload;
  const userFollows = `
    SELECT
     name
    FROM user INNER JOIN follower ON 
      user.user_id=follower.following_user_id
    WHERE follower.follower_user_id=${user_id};`;
  const getNames = await db.all(userFollows);
  response.send(getNames);
});

app.get("/user/followers/", authenticateToken, async (request, response) => {
  const { payload } = request;
  const { user_id, name, username, gender } = payload;
  const userFollows = `
    SELECT 
      name 
    FROM user INNER JOIN follower ON 
      user.user_id=follower.follower_user_id
    WHERE follower.following_user_id=${user_id};`;
  const getNames = await db.all(userFollows);
  response.send(getNames);
});

app.get("/tweets/:tweetId/", authenticateToken, async (request, response) => {
  const { tweetId } = request.params;
  const { payload } = request;
  const { user_id, name, username, gender } = payload;
  console.log(name, tweetId);
  const tweetQuery = `SELECT * FROM tweet 
      WHERE tweet_id=${tweetId};`;
  const tweetResult = await db.get(tweetQuery);

  const userFollowersQuery = `
      SELECT * 
      FROM follower INNER JOIN user
      ON user.user_id =follower.following_user_id
      WHERE follower.follower_user_id =${user_id};`;

  const userFollows = await db.all(userFollowersQuery);
  if (
    userFollows.some((item) => item.following_user_id === tweetResult.user_id)
  ) {
    console.log(tweetResult);
    console.log("------");
    console.log(userFollows);

    const getTweetDetailsQuery = `
      SELECT tweet,
      COUNT(DISTINCT(like.like_id)) AS likes,
      COUNT(DISTINCT(reply.reply_id)) AS replies,
      tweet.date_time AS dateTime
      FROM tweet INNER JOIN like 
      ON tweet.tweet_id =like.tweet_id INNER JOIN reply
      ON reply.tweet_id =tweet.tweet_id
      WHERE tweet.tweet_id =${tweetId} AND tweet.user_id=${userFollows[0].user_id};`;

    const tweetDetails = await db.get(getTweetDetailsQuery);
    response.send(tweetDetails);
  } else {
    response.status(401);
    response.send("Invalid Request");
  }
});

app.get(
  "/tweets/:tweetId/likes",
  authenticateToken,
  async (request, response) => {
    const { tweetId } = request.params;
    const { payload } = request;
    const { user_id, name, username, gender } = payload;
    console.log(name, tweetId);
    const getLikedUsersQuery = `
    SELECT * FROM follower INNER JOIN tweet ON tweet.user_id = follower.following_user_id INNER JOIN like ON like.tweet_id =tweet.tweet_id
    INNER JOIN user ON user.user_id = like.user_id
    WHERE tweet.tweet_id = ${tweetId} AND follower.follower_user_id =${user_id};`;

    const likedUsers = await db.all(getLikedUsersQuery);
    console.log(likedUsers);
    if (likedUsers.length !== 0) {
      let likes = [];
      const getNamesArray = (likedUsers) => {
        for (let item of likedUsers) {
          likes.push(item.username);
        }
      };
      getNamesArray(likedUsers);
      response.send({ likes });
    } else {
      response.status(401);
      response.send("Invalid Request");
    }
  }
);
app.get(
  "/tweets/:tweetId/replies",
  authenticateToken,
  async (request, response) => {
    const { tweetId } = request.params;
    const { payload } = request;
    const { user_id, name, username, gender } = payload;
    const getRepliedUsersQuery = `
    SELECT * FROM follower INNER JOIN tweet 
    ON tweet.user_id = follower.following_user_id
    INNER JOIN reply ON reply.tweet_id =tweet.tweet_id
    INNER JOIN user ON user.user_id = reply.user_id
    WHERE tweet.tweet_id = ${tweetId} AND follower.follower_user_id=${user_id};`;

    const repliedUsers = await db.all(getRepliedUsersQuery);
    console.log(repliedUsers);
    if (repliedUsers.length !== 0) {
      let replies = [];
      const getNamedArray = (repliedUsers) => {
        for (let item of repliedUsers) {
          let object = {
            name: item.name,
            reply: item.reply,
          };
          replies.push(object);
        }
      };
      getNamedArray(repliedUsers);
      response.send({ replies });
    } else {
      response.status(401);
      response.send("Invalid Request");
    }
  }
);
app.get("/user/tweets", authenticateToken, async (request, response) => {
  const { payload } = request;
  const { user_id, name, username, gender } = payload;
  console.log(name, user_id);
  const getTweetsDetailsQuery = `
            SELECT
               tweet.tweet AS tweet,
                COUNT(DISTINCT(like.like_id)) AS likes,
                COUNT(DISTINCT(reply.reply_id)) AS replies,
                tweet.date_time AS dateTime
            FROM 
                user INNER JOIN tweet ON user.user_id = tweet.user_id INNER JOIN like ON like.tweet_id = tweet.tweet_id INNER JOIN reply ON reply.tweet_id = tweet.tweet_id
            WHERE 
                user.user_id = ${user_id}
            GROUP BY
                tweet.tweet_id
            ;`;

  const tweetsDetails = await db.all(getTweetsDetailsQuery);
  response.send(tweetsDetails);
});
app.get("/users/tweets/", authenticateToken, async (request, response) => {
  const { payload } = request;
  const { user_id, name, username, gender } = payload;
  const getTweetsDetailsQuery = `
  SELECT tweet.tweet AS tweet,
     COUNT(DISTINCT(like.like_id)) AS likes,
     COUNT(DISTINCT(reply.reply_id)) AS replies,
     tweet.date_time AS dateTime
     FROM 
      user INNER JOIN tweet ON user.user_id =tweet.user_id INNER JOIN like ON like.tweet_id=tweet.tweet_id INNER JOIN
      reply ON reply.tweet_id = tweet.tweet_id
     WHERE user.user_id =${user_id}
     GROUP BY
       tweet.tweet_id;`;
  const tweetDetails = await db.all(getTweetsDetailsQuery);
  response.send(tweetDetails);
});
app.post("/user/tweets/", authenticateToken, async (request, response) => {
  const { tweet } = request.body;
  const { tweetId } = request;
  const { payload } = request;
  const { user_id, name, username, gender } = payload;
  const tweetQuery = `INSERT INTO tweet (tweet,user_id)
    VALUES ('${tweet}',${user_id});`;
  await db.run(tweetQuery);
  response.send("Created a Tweet");
});
app.delete(
  "/tweets/:tweetId/",
  authenticateToken,
  async (request, response) => {
    const { tweetId } = request.params;
    const { payload } = request;
    const { user_id, name, username, gender } = payload;
    const selectUserQuery = `SELECT *FROM tweet WHERE tweet.user_id=${user_id} AND tweet.tweet_id=${tweetId};`;
    const tweetUser = await db.all(selectUserQuery);
    if (tweetUser.length !== 0) {
      const deleteQuery = `DELETE FROM tweet
        WHERE tweet.user_id=${user_id} AND tweet.tweet_id=${tweetId};`;
      await db.run(deleteQuery);
      response.send("Tweet Removed");
    } else {
      response.status(401);
      response.send("Invalid Request");
    }
  }
);
module.exports = app;
