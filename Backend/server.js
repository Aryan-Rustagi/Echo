require("dotenv").config();
const cors = require("cors");
const express = require('express');

const transcribeRoute = require('./routes/transcribe');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(cors());

app.get('/', function(req,res){
    res.send("Server is running ");
});

app.use('/api/transcribe', transcribeRoute);

app.listen(PORT,()=>{
    console.log("Server is running on Port:",PORT);
});
