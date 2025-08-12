const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 5007;

// 中间件
app.use(cors());
app.use(express.json());
// 静态资源中间件
app.use(express.static('track'));

app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
}); 