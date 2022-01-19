const express = require('express');
const fs = require('fs');
const fileUpload = require('express-fileupload');
const uuid4 = require('uuid4')
const path = require('path');
const { MongoClient } = require('mongodb');

// express
const app = express();
app.use(fileUpload());
app.use(express.urlencoded({ extended: true }))
const port = 8080;
const host = '0.0.0.0';

// mongodb
const mongoDbHost = process.env.NODE_ENV === 'development' ? 'localhost' : 'mongo'
const url = `mongodb://${mongoDbHost}:27017`;
const client = new MongoClient(url);
client.connect().then(() => {
    console.log('db connected')

    const database = client.db();
    const tweetsDb = database.collection("tweets");

    app.use(express.static('frontend/public'));

    let statsTemplateString
    fs.readFile('frontend/templates/stats.html', 'utf8', function(err, data) {
        if (err) throw err;
        statsTemplateString = data
    });

    app.get('/tweet', async (req, res) => {
        if (req.query.userId) {
            const tweet = await getNextTweet(req.query.userId)
            const count = await getTweetCount(req.query.userId)
            if (!tweet) return res.status(404).send('not found')
            res.status(200).send({
                text: tweet.text,
                id: tweet.id,
                count: count
            })
        } else {
            res.status(400).send('missing query params')
        }
    })

    app.post('/', (req, res) => {
        if (
            req.body.tweetId &&
            isTweetId(req.body.tweetId) &&
            req.body.sentiment &&
            validSentiment(req.body.sentiment) &&
            req.body.stance &&
            validStance(req.body.stance) &&
            req.body.userId &&
            isUuid(req.body.userId)
        ) {
            console.log(`coder ${req.body.userId} for tweet ${req.body.tweetId}: sentiment ${req.body.sentiment}, stance ${req.body.stance}`)
            saveResult(req.body.userId, req.body.tweetId, req.body.sentiment, req.body.stance)
            res.redirect('/');
        } else {
            console.log(`invalid request: isTweetId ${isTweetId(req.body.tweetId)}; validSentiment ${validSentiment(req.body.sentiment)}; validStance ${validStance(req.body.stance)} isUuid ${isUuid(req.body.userId)}`)
            return res.status(500).send('invalid request')
        }
    })

    app.get('/stats', async (req, res) => {
        const stats = await getStats()
        const template = statsTemplateString
            .replace('%%sumTweets%%', stats.count)
            .replace('%%codedTweets%%', stats.codedCount)
            .replace('%%codedFully%%', stats.fullyCodedCount)
        res.send(template)
    })

    app.get('/result', async (req, res) => {
        const tweets = await getAllTweets()
        res.send(tweets)
    })

    const uploadAdminUrl = process.env.NODE_ENV === 'development' ? '/upload' : `/upload-${uuid4()}`
    console.log('the admin upload UI URL is', uploadAdminUrl)
    app.get(uploadAdminUrl, (req, res) => {
        backupTweets()
        res.sendFile(path.join(__dirname, './frontend/templates', 'upload.html'))
    })
    app.post(uploadAdminUrl, async (req, res) => {
        console.log(req.files)
        if(!req.files || !req.files.tweetsJSON) return res.status('400').send()

        backupTweets()

        const tweets = JSON.parse(req.files.tweetsJSON.data)
        replaceTweets(tweets)
        // handle file
        
        res.redirect('/')
    })

    function isTweetId(id) {
        return /^[0-9]{1,20}$/.test(id)
    }

    function isUuid(str) {
        return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(str)
    }
    function validSentiment(sentiment) {
        return sentiment === 'positive' || sentiment === 'negative' || sentiment === 'neutral'
    }
    function validStance(stance) { 
        return stance === 'agree' || stance === 'disagree' || stance === 'neutral'
    }

    async function getNextTweet(coderId) {
        const res = await tweetsDb.aggregate([
            { $match: {
                "sentimentResults.9": { $exists: false },
                'sentimentResults.coderId': { $ne: coderId }
            }},
            { $sample: { size: 1 } }
        ]).toArray()
        if (res.length) return res[0]
        return null
    }
    async function saveResult(coderId, tweetId, sentiment, stance) {
        await tweetsDb.updateOne({id: tweetId}, { $push: { sentimentResults: {
            coderId: coderId,
            sentiment: sentiment,
            stance: stance
        }}})
    }

    async function getStats() {
        return {
            count: await tweetsDb.count(),
            codedCount: await tweetsDb.count({"sentimentResults.0": { $exists: true }}),
            fullyCodedCount: await tweetsDb.count({"sentimentResults.9": { $exists: true }})
        }
    }

    async function getTweetCount(coderId) {
        return await tweetsDb.count({"sentimentResults": { $exists: true }, 'sentimentResults.coderId': { $eq: coderId }})
    }

    async function getAllTweets() {
        return await tweetsDb.find().toArray()
    }

    async function replaceTweets(tweets) {
        if (await tweetsDb.count() > 0) await tweetsDb.drop()
        const res = await tweetsDb.insertMany(tweets, { ordered: true })
        console.log(`${res.insertedCount} tweets were inserted`);
    }

    async function backupTweets() {
        const tweets = await getAllTweets()
        // backup tweets to json file in ./backup
        const jsonStr = JSON.stringify(tweets)
        fs.writeFileSync(`./backup/tweets-${Math.floor(new Date().getTime() / 1000)}.json`, jsonStr)
    }

    app.listen(port, host);        
})