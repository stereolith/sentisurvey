var fs = require('fs').promises;
const { MongoClient } = require('mongodb');
const mongoDbHost = process.env.NODE_ENV === 'development' ? 'localhost' : 'mongodb'
const url = `mongodb://${mongoDbHost}:27017`;

const client = new MongoClient(url);

async function importTweets(tweets) {
    try {
        tweets = tweets.map(tweet => ({
            ...tweet,
            sentimentResults: []
        }))

        await client.connect();
        const database = client.db();
        const tweetsDb = database.collection("tweets");  
     
        const result = await tweetsDb.insertMany(tweets, { ordered: true });
        console.log(`${result.insertedCount} tweets were inserted`);
    } finally {
      await client.close();
    }
}
  
async function importTweetsFromFile() {
    try {
        const tweetsStr = await fs.readFile('tweets.json', 'utf8')
        tweets = JSON.parse(tweetsStr)
        await importTweets(tweets)
    } catch (error) {
        console.log(error)
    }
}

importTweetsFromFile().catch(console.dir);