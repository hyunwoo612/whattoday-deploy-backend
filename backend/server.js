const express = require("express"); // npm i express | yarn add express
const cors = require("cors"); // npm i cors | yarn add cors
const mysql = require("mysql"); // npm i mysql | yarn add mysql
const axios = require("axios");
const { S3Client } = require('@aws-sdk/client-s3');
const multerS3 = require('multer-s3');
const multer = require("multer");
const path = require('path');
const bcrypt = require('bcrypt');
const admin = require('firebase-admin');
const app = express();

const dotenv = require('dotenv')

dotenv.config();

const PORT = process.env.PORT || 3001;

const serviceAccount = {
  type: process.env.FIREBASE_TYPE,
  project_id: process.env.FIREBASE_PROJECT_ID,
  private_key_id: process.env.FIREBASE_PRIVATE_KEY_ID,
  private_key: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n'), // Handle newlines
  client_email: process.env.FIREBASE_CLIENT_EMAIL,
  client_id: process.env.FIREBASE_CLIENT_ID,
  auth_uri: process.env.FIREBASE_AUTH_URI,
  token_uri: process.env.FIREBASE_TOKEN_URI,
  auth_provider_x509_cert_url: process.env.FIREBASE_AUTH_PROVIDER_X509_CERT_URL,
  client_x509_cert_url: process.env.FIREBASE_CLIENT_X509_CERT_URL
};

const endpoint = process.env.S3_ENDPOINT || 'https://kr.object.ncloudstorage.com';
const region = process.env.S3_REGION || 'kr-standard';
const accessKeyId = process.env.S3_ACCESS_KEY;
const secretAccessKey = process.env.S3_SECRET_KEY;

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = mysql.createPool({
  host: process.env.DB_HOST, // 호스트
  port: process.env.DB_PORT,
  user: process.env.DB_USER, // 데이터베이스 계정
  password: process.env.DB_PASSWORD, // 데이터베이스 비밀번호
  database: "personaldata", // 사용할 데이터베이스
});

const db2 = mysql.createConnection({
  host: process.env.DB_HOST,
  port: process.env.DB_PORT,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: "image_uploads"
});

const db3 = mysql.createPool({
  host: process.env.DB_HOST,
  port: process.env.DB_PORT,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: "diary_uploads"
});

const db4 = mysql.createConnection({
  host: process.env.DB_HOST,
  port: process.env.DB_PORT,
  user: process.env.DB_USER, // 데이터베이스 사용자명
  password: process.env.DB_PASSWORD, // 데이터베이스 비밀번호
  database: 'school_num' // 데이터베이스 이름
});

const db5 = mysql.createConnection({
  host: process.env.DB_HOST,
  port: process.env.DB_PORT,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: 'today'
});

const db6 = mysql.createConnection({
  host: process.env.DB_HOST,
  port: process.env.DB_PORT,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: 'sign'
});

const db7 = mysql.createConnection({
  host: process.env.DB_HOST,
  port: process.env.DB_PORT,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: 'school_department'  // 데이터베이스명
});

db7.connect((err) => {
  if (err) {
    console.error('데이터베이스 연결 실패:', err);
    return;
  }
  console.log('db7 데이터베이스에 연결되었습니다.');
});

db6.connect((err) => {
  if (err) {
    console.error('DB 연결 실패:', err);
  } else {
    console.log('DB 연결 성공');
  }
});

db2.connect((err) => {
  if (err) {
      console.error('MySQL connection error:', err);
      process.exit(1);
  }
});

const s3Client = new S3Client({
  endpoint: endpoint,
  region: region,
  credentials: {
      accessKeyId: accessKeyId,
      secretAccessKey: secretAccessKey
  }
});

app.use(
  cors({
    origin: "*", // 출처 허용 옵션
    credentials: true, // 응답 헤더에 Access-Control-Allow-Credentials 추가
    optionsSuccessStatus: 200, // 응답 상태 200으로 설정
  })
);

// post 요청 시 값을 객체로 바꿔줌
app.use(express.urlencoded({ extended: true }));
app.use(express.json()); // JSON 형태의 요청을 파싱하도록 추가

app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

app.get('/', (req, res)=>{
	res.send('hello express');
});

app.listen(PORT, () => {
	console.log(PORT, '번 포트에서 대기 중');
});

app.post('/signup', async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).send('이메일과 비밀번호를 입력해주세요.');
  }

  try {
    const hashedPassword = await bcrypt.hash(password, 10);

    const query = 'INSERT INTO login (email, password) VALUES (?, ?)';
    db6.query(query, [email, hashedPassword], (err, result) => {
      if (err) {
        console.error('DB 저장 실패:', err);
        return res.status(500).send('서버 오류');
      }

      // db6에 저장이 성공한 경우, db5의 student 테이블에 이메일을 삽입
      const studentQuery = 'INSERT INTO student (email) VALUES (?)';
      db5.query(studentQuery, [email], (err, result) => {
        if (err) {
          console.error('DB5 저장 실패:', err);
          return res.status(500).send('서버 오류');
        }
        res.status(201).send('회원가입 성공');
      });
    });
  } catch (err) {
    console.error('비밀번호 해시화 실패:', err);
    res.status(500).send('서버 오류');
  }
});

app.post('/defaultlogin', async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).send('이메일과 비밀번호를 입력해주세요.');
  }

  try {
    const query = 'SELECT * FROM login WHERE email = ?';
    db6.query(query, [email], async (err, results) => {
      if (err) {
        console.error('DB 조회 실패:', err);
        return res.status(500).send('서버 오류');
      }

      if (results.length === 0) {
        return res.status(401).send('이메일 또는 비밀번호가 잘못되었습니다.');
      }

      const user = results[0];
      const isPasswordMatch = await bcrypt.compare(password, user.password);

      if (!isPasswordMatch) {
        return res.status(401).send('이메일 또는 비밀번호가 잘못되었습니다.');
      }

      res.status(200).send('로그인 성공');
    });
  } catch (err) {
    console.error('로그인 처리 실패:', err);
    res.status(500).send('서버 오류');
  }
});

app.get("/schooldata", (req, res) => {
  const email = req.query.email;
  console.log('Received email:', email);

  if (!email) {
    return res.status(400).send({ message: 'Email is required' });
  }

  db5.query('SELECT Office, schoolCode FROM student WHERE email = ?', [email], (error, results) => {
    if (error) {
      console.error('Error executing query:', error);
      return res.status(500).send("Error fetching data from database");
    }

    console.log('Query result:', results);

    if (results.length === 0) {
      console.log('Profile not found for email:', email);
      return res.status(404).send({ message: 'Profile not found' });
    }

    const Office = results[0].Office;
    const schoolCode = results[0].schoolCode;
    console.log('Office:', Office, 'SchoolCode:', schoolCode);

    axios.get(
      `https://open.neis.go.kr/hub/SchoolSchedule?ATPT_OFCDC_SC_CODE=${Office}&SD_SCHUL_CODE=${schoolCode}&KEY=9333296d834848e0939ca37ddad7d407&Type=json&pIndex=1&pSize=1000&AA_FROM_YMD=20240101&AA_TO_YMD=20241231`
    )
    .then(response => {
      res.json(response.data);
    })
    .catch(error => {
      console.error("Error fetching data from external API:", error);
      res.status(500).send("Error fetching data");
    });
  });
});

app.get("/timetabledata", (req, res) => {
  const email = req.query.email;

  if (!email) {
    return res.status(400).send({ message: 'Email is required' });
  }

  db5.query('SELECT Office, schoolCode, grade, Class FROM student WHERE email = ?', [email], (error, results) => {
    if (error) {
      return res.status(500).send({ message: "Error fetching data from database" });
    }

    if (results.length === 0) {
      return res.status(404).send({ message: 'Profile not found' });
    }

    const { Office, schoolCode, grade, Class } = results[0];

    // 시작 날짜와 종료 날짜 설정
    const startDate = new Date('2024-01-01');
    const endDate = new Date('2024-12-31');

    const fetchTimetableData = async (start, end) => {
      const apiUrl = `https://open.neis.go.kr/hub/hisTimetable?ATPT_OFCDC_SC_CODE=${Office}&SD_SCHUL_CODE=${schoolCode}&KEY=9333296d834848e0939ca37ddad7d407&Type=json&pIndex=1&pSize=1000&TI_FROM_YMD=${start}&TI_TO_YMD=${end}&GRADE=${grade}&CLASS_NM=${Class}`;
      try {
        const response = await axios.get(apiUrl);
        
        return response.data;
      } catch (error) {
        console.error("Error fetching data from external API:", error);
        return null;
      }
    };

    const promises = [];
    let current = new Date(startDate);

    // 주일 단위로 날짜 범위를 나누어 API 요청을 수행
    while (current <= endDate) {
      const weekStart = new Date(current);
      // 날짜를 월요일로 설정
      weekStart.setDate(weekStart.getDate() - weekStart.getDay() + 1);
      
      const weekEnd = new Date(weekStart);
      weekEnd.setDate(weekEnd.getDate() + 6);

      const formattedStart = weekStart.toISOString().split('T')[0].replace(/-/g, '');
      const formattedEnd = weekEnd.toISOString().split('T')[0].replace(/-/g, '');

      promises.push(fetchTimetableData(formattedStart, formattedEnd));

      current.setDate(current.getDate() + 7);
    }

    Promise.all(promises).then(results => {
      const combinedData = results.filter(data => data !== null); // null 값 제거
      const weeklyData = combinedData.map(d => {
        if (d && d.hisTimetable && d.hisTimetable[1] && d.hisTimetable[1].row) {
          return d.hisTimetable[1].row.map(item => {
            return {
              ...item,
              ITRT_CNTNT: item.ITRT_CNTNT || 'ITRT_CNTNT not found'
            };
          });
        }
        return [];
      });

      // 주 단위로 데이터 분할
      const weeklyResults = weeklyData.reduce((acc, weekData, index) => {
        acc[`week${index + 1}`] = weekData;
        return acc;
      }, {});

      res.json(weeklyResults);
    }).catch(error => {
      console.error("Error processing timetable data:", error);
      res.status(500).send({ message: "Error processing timetable data" });
    });
  });
});

app.get("/mealdata", (req, res) => {
  const email = req.query.email;
  const date = req.query.date;

  if (!email) {
    return res.status(400).send({ message: 'Email is required' });
  }

  if (!date) {
    return res.status(400).send({ message: 'Date is required' });
  }

  db5.query('SELECT Office, schoolCode FROM student WHERE email = ?', [email], (error, results) => {
    if (error) {
      return res.status(500).send({ message: "Error fetching data from database" });
    }

    if (results.length === 0) {
      return res.status(404).send({ message: 'Profile not found' });
    }

    const { Office, schoolCode } = results[0];

    const fetchMealData = async (mealCode) => {
      const apiUrl = `https://open.neis.go.kr/hub/mealServiceDietInfo?ATPT_OFCDC_SC_CODE=${Office}&SD_SCHUL_CODE=${schoolCode}&KEY=9333296d834848e0939ca37ddad7d407&MMEAL_SC_CODE=${mealCode}&Type=json&pIndex=1&pSize=1000&MLSV_FROM_YMD=${date}&MLSV_TO_YMD=${date}`;
      try {
        const response = await axios.get(apiUrl);
        return response.data;
      } catch (error) {
        console.error("Error fetching data from external API:", error);
        return null;
      }
    };

    Promise.all([fetchMealData(1), fetchMealData(2), fetchMealData(3)]).then(([breakfastData, lunchData, dinnerData]) => {
      const mealData = {
        breakfast: [],
        lunch: [],
        dinner: []
      };

      if (breakfastData && breakfastData.mealServiceDietInfo && breakfastData.mealServiceDietInfo[1] && breakfastData.mealServiceDietInfo[1].row) {
        mealData.breakfast = breakfastData.mealServiceDietInfo[1].row.map(item => ({
          ...item,
          DDISH_NM: item.DDISH_NM || 'DDISH_NM not found'
        }));
      }

      if (lunchData && lunchData.mealServiceDietInfo && lunchData.mealServiceDietInfo[1] && lunchData.mealServiceDietInfo[1].row) {
        mealData.lunch = lunchData.mealServiceDietInfo[1].row.map(item => ({
          ...item,
          DDISH_NM: item.DDISH_NM || 'DDISH_NM not found'
        }));
      }

      if (dinnerData && dinnerData.mealServiceDietInfo && dinnerData.mealServiceDietInfo[1] && dinnerData.mealServiceDietInfo[1].row) {
        mealData.dinner = dinnerData.mealServiceDietInfo[1].row.map(item => ({
          ...item,
          DDISH_NM: item.DDISH_NM || 'DDISH_NM not found'
        }));
      }

      res.json(mealData);
    }).catch(error => {
      console.error("Error fetching meal data:", error);
      res.status(500).send({ message: "Error fetching meal data" });
    });
  });
});


app.post('/personal-addschedule', (req, res) => {
  let { email, calendar_name, calendar_date } = req.body;

  // 날짜 변환
  const date = new Date(calendar_date);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  calendar_date = `${year}-${month}-${day}`; // 날짜 형식을 YYYY-MM-DD로 변환

  const query = 'INSERT INTO personal (email, calendar_name, calendar_date) VALUES (?, ?, ?)';

  db.query(query, [email, calendar_name, calendar_date], (error, results) => {
    if (error) {
      console.error('Error inserting schedule:', error);
      res.status(500).send('Server error');
    } else {
      console.log('Schedule inserted successfully:', results);
      res.status(200).send('Schedule added successfully');
    }
  });
});

app.post('/personal-delschedule', (req, res) => {
  let { email, calendar_name, calendar_date } = req.body;

  // 날짜 변환
  const date = new Date(calendar_date);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  calendar_date = `${year}-${month}-${day}`; // 날짜 형식을 YYYY-MM-DD로 변환

  const query = 'DELETE FROM personal WHERE email = ? AND calendar_name = ? AND calendar_date = ?';

  console.log(email, calendar_name, calendar_date);

  db.query(query, [email, calendar_name, calendar_date], (error, results) => {
    if (error) {
      console.error('Error deleting schedule:', error);
      res.status(500).send('Server error');
    } else {
      console.log('Schedule deleted successfully:', results);
      res.status(200).send('Schedule deleted successfully');
    }
  });
});

app.get("/personaldata", (req, res) => {
  const email = req.query.email;
  const query = "SELECT calendar_name, calendar_date FROM personal where email = ?";

  db.query(query, [email], (err, result) => {
    if (err) {
      console.error("Error executing query:", err);
      res.status(500).send("Error fetching data");
      return;
    }

    // 날짜 변환
    const formattedResult = result.map(item => {
      const date = new Date(item.calendar_date);
      const year = date.getFullYear();
      const month = String(date.getMonth() + 1).padStart(2, '0');
      const day = String(date.getDate()).padStart(2, '0');
      const formattedDate = `${year}${month}${day}`;

      return {
        ...item,
        calendar_date: formattedDate
      };
    });

    res.json(formattedResult);
  });
});

// 업로드 설정 함수
function setUpload(bucket) {
  return multer({
      storage: multerS3({
          s3: s3Client,
          bucket: bucket,
          acl: 'public-read-write',
          key: function (req, file, cb) {
              const extension = path.extname(file.originalname);
              cb(null, 'post/' + Date.now().toString() + extension);
          },
      }),
  }).single('file'); // .single('file') 매우 중요!
}

const setSafeUpdates = (isEnabled, callback) => {
  const query = `SET SQL_SAFE_UPDATES = ${isEnabled ? 1 : 0}`;
  db2.query(query, callback);
};

app.post('/upload', setUpload('uploadsdiaryimg'), (req, res) => {
  const { email, date } = req.body;
  console.log('Received email:', email, 'Received date:', date);

  if (!date || !email) {
      console.error('Missing required fields:', { email, date });
      return res.status(400).json({ message: 'Missing required fields.' });
  }

  if (!req.file) {
      console.error('No file uploaded.');
      return res.status(400).json({ message: 'No file uploaded.' });
  }

  const filePath = req.file.location;
  console.log('Full file path:', filePath);
  
  const relativeFilePath = filePath.split('/post/')[1];
  console.log('Relative file path:', relativeFilePath);

  if (!relativeFilePath) {
      console.error('Relative file path is invalid.');
      return res.status(400).json({ message: 'Invalid file path.' });
  }

  getStudentInfo(email, (err, result) => {
      if (err) {
          console.error('Error fetching class and grade:', err);
          return res.status(err.status || 500).json({ message: err.message || 'Internal Server Error' });
      }

      const { Class, grade, schoolCode } = result;
      console.log('Fetched class and grade:', { Class, grade, schoolCode });

      const selectQuery = 'SELECT path FROM images WHERE date = ? AND grade = ? AND Class = ? AND schoolCode = ?';
      db2.query(selectQuery, [date, grade, Class, schoolCode], (err, results) => {
          if (err) {
              console.error('Database query error:', err);
              return res.status(500).json({ message: 'Database error.' });
          }

          const handleDatabaseError = (err, res, message) => {
              console.error(message, err);
              return res.status(500).json({ message: 'Database error.' });
          };

          if (results.length > 0) {
              const updateQuery = 'UPDATE images SET path = ? WHERE date = ? AND schoolCode = ? AND grade = ? AND Class = ?';

              setSafeUpdates(false, (err) => {
                  if (err) return handleDatabaseError(err, res, 'Error disabling safe mode:');

                  db2.query(updateQuery, [relativeFilePath, date, schoolCode, grade, Class], (err, result) => {
                      if (err) return handleDatabaseError(err, res, 'Database update error:');

                      setSafeUpdates(true, (err) => {
                          if (err) return handleDatabaseError(err, res, 'Error enabling safe mode:');

                          if (result.affectedRows === 0) {
                              console.error('No rows affected. Update failed.');
                              return res.status(404).json({ message: 'Failed to update. No matching record found.' });
                          }

                          res.json({ message: 'Image path updated successfully.', filePath: relativeFilePath });
                      });
                  });
              });
          } else {
              const insertQuery = 'INSERT INTO images (date, path, grade, Class, email, schoolCode) VALUES (?, ?, ?, ?, ?, ?)';

              db2.query(insertQuery, [date, relativeFilePath, grade, Class, email, schoolCode], (err, result) => {
                  if (err) return handleDatabaseError(err, res, 'Database insert error:');

                  res.json({ message: 'File uploaded successfully.', filePath: relativeFilePath });
              });
          }
      });
  });
});


app.get('/image', (req, res) => {
  const { date, email } = req.query;
  console.log('Received email:', email, 'Received date:', date);

  if (!date || !email) {
    console.error('Missing required fields.');
    return res.status(400).send('Missing required fields.');
  }

  const studentSql = 'SELECT Class, grade, schoolCode FROM student WHERE email = ?';
  db5.query(studentSql, [email], (studentErr, studentResults) => {
    if (studentErr) {
      console.error('Database query error:', studentErr);
      return res.status(500).send('Database error.');
    }

    if (studentResults.length === 0) {
      console.error('No student info found for email:', email);
      return res.status(404).send({ message: 'No student info found for the given email' });
    }

    const { Class, grade, schoolCode } = studentResults[0];
    console.log('Fetched student info:', { Class, grade, schoolCode });

    const selectQuery = 'SELECT path FROM images WHERE date = ? AND grade = ? AND Class = ? AND schoolCode = ?';
    db2.query(selectQuery, [date, grade, Class, schoolCode], (imageErr, results) => {
      if (imageErr) {
        console.error('Database query error:', imageErr);
        return res.status(500).send('Database error.');
      }

      if (results.length > 0) {
        const imagePath = results[0].path;
        console.log('Image path found:', imagePath);
        const fullUrl = `https://uploadsdiaryimg.kr.object.ncloudstorage.com/post/${imagePath}`;
        res.json({ imagePath: fullUrl });
      } else {
        console.error('Image not found.');
      }
    });
  });
});

// 다이어리 항목 추가
app.post('/diary/add', (req, res) => {
  const { email, date, content } = req.body;

  if (!email || !date || !content) {
    console.error('Missing required fields');
    return res.status(400).send({ message: 'Email, date, and content are required' });
  }

  getStudentInfo(email, (err, studentInfo) => {
    if (err) {
      console.error('Error fetching student info:', err);
      return res.status(err.status).send({ message: err.message });
    }

    const { Class, grade, schoolCode } = studentInfo;
    const diarySql = 'INSERT INTO diary (date, content, Class, grade, email, schoolCode) VALUES (?, ?, ?, ?, ?, ?)';
    db3.query(diarySql, [date, content, Class, grade, email, schoolCode], (err) => {
      if (err) {
        console.error('Error adding diary entry:', err);
        return res.status(500).send({ message: 'Failed to add diary entry' });
      }
      console.log('Diary entry added successfully');
      res.status(200).send({ message: 'Diary entry added successfully' });
    });
  });
});

// 다이어리 항목 업데이트
app.put('/diary/update', (req, res) => {
  const { email, date, content } = req.body;

  if (!email || !date || !content) {
    console.error('Missing required fields');
    return res.status(400).send({ message: 'Email, date, and content are required' });
  }

  getStudentInfo(email, (err, studentInfo) => {
    if (err) {
      console.error('Error fetching student info:', err);
      return res.status(err.status).send({ message: err.message });
    }

    const { Class, grade, schoolCode } = studentInfo;

    // 먼저 해당 일지 항목이 존재하는지 확인합니다.
    const checkDiarySql = 'SELECT * FROM diary WHERE date = ? AND Class = ? AND grade = ? AND schoolCode = ?';
    db3.query(checkDiarySql, [date, Class, grade, schoolCode], (err, results) => {
      if (err) {
        console.error('Error checking diary entry:', err);
        return res.status(500).send({ message: 'Failed to check diary entry' });
      }
      if (results.length === 0) {
        console.error('Diary entry not found for date:', date, 'and email:', email);
        return res.status(404).send({ message: 'Diary entry not found' });
      }

      // 일지 항목이 존재하면 업데이트를 진행합니다.
      const diarySql = 'UPDATE diary SET content = ?, Class = ?, grade = ? WHERE date = ? AND email = ? AND schoolCode = ?';
      db3.query(diarySql, [content, Class, grade, date, email, schoolCode], (err, result) => {
        if (err) {
          console.error('Error updating diary entry:', err);
          return res.status(500).send({ message: 'Failed to update diary entry' });
        }
        console.log('Diary entry updated successfully');
        res.status(200).send({ message: 'Diary entry updated successfully' });
      });
    });
  });
});


// 다이어리 항목 조회
app.get('/diary', (req, res) => {
  const { email, date } = req.query;

  if (!email || !date) {
    return res.status(400).send({ message: 'Email and date are required' });
  }

  getStudentInfo(email, (err, studentInfo) => {
    if (err) {
      console.error('Error fetching student info:', err);
      return res.status(err.status).send({ message: err.message });
    }

    const { Class, grade, schoolCode } = studentInfo;
    const diarySql = 'SELECT content FROM diary WHERE date = ? AND Class = ? AND grade = ? AND schoolCode = ?';
    db3.query(diarySql, [date, Class, grade, schoolCode], (err, results) => {
      if (err) {
        console.error('Error fetching diary entry:', err);
        return res.status(500).send({ message: 'Failed to fetch diary entry' });
      }
      if (results.length === 0) {
        return res.status(404).send({ message: 'No diary entry found for the given date' });
      }
      res.status(200).send(results[0]);
    });
  });
});

const getStudentInfo = (email, callback) => {
  const studentSql = 'SELECT * FROM student WHERE email = ?';
  db5.query(studentSql, [email], (err, results) => {
    if (err) {
      console.error('Database query error:', err);
      return callback({ status: 500, message: 'Database query error' });
    }
    if (results.length === 0) {
      console.log('Student not found for email:', email);
      return callback({ status: 404, message: 'Student not found' });
    }
    console.log('Student info:', results[0]);
    callback(null, results[0]);
  });
};

app.post('/getSchools', (req, res) => {
  const { office, page, limit } = req.body;
  const table = office.toLowerCase(); // 테이블명으로 사용

  const offset = (page - 1) * limit;
  const sql = `SELECT 학교명, 행정표준코드 FROM ?? LIMIT ? OFFSET ?`; // 행정표준코드 추가
  db4.query(sql, [table, parseInt(limit), parseInt(offset)], (err, results) => {
    if (err) {
      console.error(err);
      res.status(500).send('서버 오류');
      return;
    }
    res.json(results);
  });
});

app.post('/login', (req, res) => {
  const idToken = req.body.idToken;

  admin.auth().verifyIdToken(idToken)
    .then(decodedToken => {
      const email = decodedToken.email;
      const photoURL = decodedToken.picture;

      const selectQuery = 'SELECT photoURL FROM student WHERE email = ?';
      db5.query(selectQuery, [email], (err, results) => {
        if (err) {
          console.error('Error querying user:', err);
          return res.status(500).send({ message: 'Internal Server Error' });
        }

        if (results.length > 0) {
          // 기존 사용자가 존재하는 경우, photoURL를 업데이트하지 않습니다.
          return res.send({ message: 'User logged in', email });
        } else {
          // 새로운 사용자이거나 photoURL이 없는 경우, 삽입합니다.
          const insertQuery = 'INSERT INTO student (email, photoURL) VALUES (?, ?)';
          db5.query(insertQuery, [email, photoURL], (err, result) => {
            if (err) {
              console.error('Error inserting user:', err);
              return res.status(500).send({ message: 'Internal Server Error' });
            }
            res.send({ message: 'User logged in', email });
          });
        }
      });
    })
    .catch(error => {
      console.error('Error verifying ID token:', error);
      res.status(401).send({ message: 'Unauthorized' });
    });
});


app.get('/profile', (req, res) => {
  const email = req.query.email;
  console.log('Received email for profile:', email); // 이메일 로그 출력

  if (!email) {
    return res.status(400).send({ message: 'Email is required' });
  }

  const query = 'SELECT Name, Office, schoolName, grade, Class, num, schoolCode FROM student WHERE email = ?';
  db5.query(query, [email], (err, results) => {
    if (err) {
      console.error('Error fetching profile:', err);
      return res.status(500).send({ message: 'Internal Server Error' });
    }

    if (results.length === 0) {
      console.log('Profile not found for email:', email);
      return res.status(404).send({ message: 'Profile not found' });
    }

    // name 값이 null일 경우 빈 문자열로 설정
    const profile = results[0];
    profile.Name = profile.Name || '';

    res.send(profile);
  });
});

app.post('/profile', (req, res) => {
  const { name, email, Office, schoolName, schoolCode, grade, Class, num } = req.body;

  if (!email || !name || !Office || !schoolName || !schoolCode || !grade || !Class || !num) {
    return res.status(400).send({ message: 'All fields are required' });
  }

  const query = 'UPDATE student SET Office = ?, schoolName = ?, schoolCode = ?, grade = ?, Class = ?, num = ?, Name = ? WHERE email = ?';
  db5.query(query, [Office, schoolName, schoolCode, grade, Class, num, name, email], (err, result) => {
    if (err) {
      console.error('Error updating profile:', err);
      return res.status(500).send({ message: 'Internal Server Error' });
    }

    if (result.affectedRows === 0) {
      return res.status(404).send({ message: 'Profile not found' });
    }

    res.send({ message: 'Profile updated successfully' });
  });
});

app.post('/uploadimg', setUpload('profileimg'), (req, res) => {
  try {
      if (!req.file) {
          console.log('No file uploaded.');
          return res.status(400).send('No file uploaded.');
      }

      console.log('File uploaded:', req.file);

      const email = req.headers.email; // 헤더에서 이메일 가져오기
      if (!email) {
          console.error('No email provided in the request.');
          return res.status(400).send('No email provided.');
      }

      const filePath2 = req.file.location;
      const fileName = path.basename(filePath2); // 파일 이름만 추출

      const selectQuery = 'SELECT email FROM student WHERE email = ?';
      db5.query(selectQuery, [email], (err, results) => {
          if (err) {
              console.error('Database error:', err);
              return res.status(500).send('Database error.');
          }

          if (results.length > 0) {
              // 이메일이 존재하면 photoURL 업데이트
              const updateQuery = 'UPDATE student SET photoURL = ? WHERE email = ?';
              db5.query(updateQuery, [fileName, email], (updateErr, updateResults) => {
                  if (updateErr) {
                      console.error('Database error:', updateErr);
                      return res.status(500).send('Database error.');
                  }
                  res.json({ message: 'Photo URL updated successfully.', filePath: fileName });
              });
          } else {
              // 이메일이 존재하지 않으면 에러 반환
              res.status(404).send('Email not found.');
          }
      });
  } catch (error) {
      console.error(error.message);
      res.status(400).json({ message: error.message });
  }
});

app.get('/getimg', (req, res) => {
  const email = req.query.email; // Get the email from the query parameter

  if (!email) {
      return res.status(400).send('Email is required.');
  }

  const selectQuery = 'SELECT photoURL FROM student WHERE email = ?';
  db5.query(selectQuery, [email], (err, results) => {
      if (err) {
          console.error('Database error:', err);
          return res.status(500).send('Database error.');
      }

      if (results.length > 0) {
          const photoURL = results[0].photoURL;
          const imageURL = `https://kr.object.ncloudstorage.com/profileimg/post/${photoURL}`;

          res.json({ imagePath: imageURL });
      } else {
          res.status(404).send({ message: 'Email not found.' });
      }
  });
});

app.get('/departments', (req, res) => {
  const { office, schoolCode } = req.query;

  if (!office) {
    res.status(400).send('office 파라미터가 필요합니다.');
    return;
  }

  const table = office.toLowerCase();

  const sql = `SELECT 학과명 FROM ?? WHERE 학교명 = ?`;
  db7.query(sql, [table, schoolCode], (err, results) => {
    if (err) {
      console.error('SQL Error: ', err);
      res.status(500).send('서버 오류 발생');
      return;
    }
    res.json(results);
  });
});

