const cors = require("cors");
const http = require("http");
const fs = require("fs");
const axios = require("axios");
const path = require("path");
const express = require("express");
const { Server } = require("socket.io");
const { Readable } = require("stream");
const dotenv = require("dotenv");
const { PutObjectCommand, S3Client } = require("@aws-sdk/client-s3");

const app = express();
dotenv.config();
const s3 = new S3Client({
  credentials: {
    accessKeyId: process.env.ACCESS_KEY,
    secretAccessKey: process.env.SECRET_KEY,
  },
  region: process.env.BUCKET_REGION,
});

const server = http.createServer(app);
app.use(cors());

const io = new Server(server, {
  cors: {
    origin: process.env.ELECTRON_HOST,
    methods: ["GET", "POST"],
  },
});

io.on("connection", (socket) => {
  console.log("🟢 socket is connected");
  const uploadPath = path.join(__dirname, "temp_upload");

  if (!fs.existsSync(uploadPath)) {
    fs.mkdirSync(uploadPath);
  }
  let recorderChunks = [];
  socket.on("video-chunks", async (data) => {
    console.log("🎞️ video chunk is sent ");
    const writeStream = fs.createWriteStream("temp_upload/" + data.filename);
    recorderChunks.push(data.chunks);
    const videoBlob = new Blob(recorderChunks, {
      type: "video/webm; codecs=vp9",
    });
    const buffer = Buffer.from(await videoBlob.arrayBuffer());
    const readStream = Readable.from(buffer);
    readStream.pipe(writeStream).on("finish", () => {
      console.log("💾 Chunk saved");
    });
  });
  socket.on("process-video", async (data) => {
    console.log("⌛ video in process: ", data);
    recorderChunks = [];
    fs.readFile("/temp_upload/" + data.filename, async (err, file) => {
      const processing = await axios.post(
        `${process.env.NEXT_API_HOST}/recording/${data.userId}/processing`
      );
      if (processing.data.status !== 200)
        return console.log("🔴 Error: ", processing.data);
      const Key = data.filename;
      const Bucket = process.env.BUCKET_NAME;
      const ContentType = "video/webm";
      const command = new PutObjectCommand({
        Key,
        Bucket,
        ContentType,
        Body: file,
      });

      const fileStatus = await s3.send(command);

      //whisper ai for transcribe video and open ai for summary

      if (fileStatus["$metadata"].httpStatusCode === 200) {
        console.log("✅ video uploaded to AWS");

        if (processing.data.plan === "PRO")
          fs.stat("temp_upload/" + data.filename, async (err, stat) => {
            if (!err) {
              // only for 25 mb (whisper restriction)
              if (stat.size < 25000000) {
                //const transcription = await
              }
            }
          });
      }
    });
  });
  socket.on("disconnect", async (data) => {
    console.log("📞 socket.id is disconnected", socket.id);
  });
});

server.listen(5000, () => {
  console.log("✅ listening to port 5000");
});
