require("dotenv").config();
const cors = require("cors");
const express = require('express');

const transcribeRoute = require('./routes/transcribe');
const chatRoute = require('./routes/chat');
const ttsRoute = require('./routes/tts');
const sttKeysRoute = require('./routes/stt-keys');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(cors());

app.get('/', function(req,res){
    res.send("Server is running ");
});

app.use('/api/transcribe', transcribeRoute);
app.use('/api/chat', chatRoute);
app.use('/api/tts', ttsRoute);
app.use('/api/stt-keys', sttKeysRoute);

app.listen(PORT,()=>{
    console.log("Server is running on Port:",PORT);
});
