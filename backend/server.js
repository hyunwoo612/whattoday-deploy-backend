const express = require("express"); // npm i express | yarn add express
const cors = require("cors"); // npm i cors | yarn add cors
const mysql = require("mysql"); // npm i mysql | yarn add mysql
const axios = require("axios");
const multer = require("multer");
const path = require('path');
const admin = require('firebase-admin');
const fs = require('fs');
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

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = mysql.createPool({
  host: process.env.DB_HOST, // 호스트
  user: process.env.DB_USER, // 데이터베이스 계정
  password: process.env.DB_PASSWORD, // 데이터베이스 비밀번호
  database: "personaldata", // 사용할 데이터베이스
});

const db2 = mysql.createConnection({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: "image_uploads"
});

const db3 = mysql.createPool({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: "diary_uploads"
});

const db4 = mysql.createConnection({
  host: process.env.DB_HOST,
  user: process.env.DB_USER, // 데이터베이스 사용자명
  password: process.env.DB_PASSWORD, // 데이터베이스 비밀번호
  database: 'school_num' // 데이터베이스 이름
});

const db5 = mysql.createConnection({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: 'today'
});

db2.connect((err) => {
  if (err) {
      console.error('MySQL connection error:', err);
      process.exit(1);
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
      const apiUrl = `https://open.neis.go.kr/hub/hisTimetable?ATPT_OFCDC_SC_CODE=${Office}&SD_SCHUL_CODE=${schoolCode}&KEY=9333296d834848e0939ca37ddad7d407&Type=json&pIndex=1&pSize=1000&TI_FROM_YMD=${start}&TI_TO_YMD=${end}&GRADE=${grade}&CLASS_NM=${Class}&DDDEP_NM=소프트웨어개발과`;
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

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
      cb(null, 'uploads/');
  },
  filename: (req, file, cb) => {
      cb(null, Date.now() + path.extname(file.originalname));
  }
});

const upload = multer({ storage: storage });

const storage2 = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, 'profileimg/');
},
filename: (req, file, cb) => {
    cb(null, Date.now() + path.extname(file.originalname));
}
});

const upload2 = multer({ storage : storage2 });

app.post('/upload', upload.single('file'), (req, res) => {
  const { email, date } = req.body;
  console.log('Received email:', email, 'Received date:', date);

  if (!date || !email) {
      console.error('Missing required fields:', { email, date });
      return res.status(400).send('Missing required fields.');
  }

  if (!req.file) {
      console.error('No file uploaded.');
      return res.status(400).send('No file uploaded.');
  }

  const filePath = `/uploads/${req.file.filename}`;
  console.log('File uploaded to:', filePath);

  getStudentInfo(email, (err, result) => {
      if (err) {
          console.error('Error fetching class and grade:', err);
          return res.status(err.status).send(err.message);
      }

      const { Class, grade, schoolCode } = result;
      console.log('Fetched class and grade:', { Class, grade, schoolCode });

      const selectQuery = 'SELECT path FROM images WHERE date = ? AND grade = ? AND Class = ? AND schoolCode = ?';
      console.log('Executing select query:', selectQuery, [date, grade, Class, schoolCode]);
      db2.query(selectQuery, [date, grade, Class, schoolCode], (err, results) => {
          if (err) {
              console.error('Database query error:', err);
              return res.status(500).send('Database error.');
          }

          console.log('Select query results:', results);

          if (results.length > 0) {
              console.log('Updating existing image path');
              const updateQuery = 'UPDATE images SET path = ? WHERE date = ? AND schoolCode = ? AND grade = ? AND Class = ?';
              console.log('Update query:', updateQuery, [filePath, date, schoolCode, grade, Class]);

              // Safe mode 비활성화
              console.log('Disabling safe mode');
              db2.query('SET SQL_SAFE_UPDATES = 0', (err) => {
                  if (err) {
                      console.error('Error disabling safe mode:', err);
                      return res.status(500).send('Database error.');
                  }

                  db2.query(updateQuery, [filePath, date, schoolCode, grade, Class, email], (err, result) => {
                      if (err) {
                          console.error('Database update error:', err);
                          return res.status(500).send('Database error.');
                      }
                      console.log('Image path updated successfully. Affected rows:', result.affectedRows);

                      // Safe mode 다시 활성화
                      console.log('Enabling safe mode');
                      db2.query('SET SQL_SAFE_UPDATES = 1', (err) => {
                          if (err) {
                              console.error('Error enabling safe mode:', err);
                              return res.status(500).send('Database error.');
                          }

                          if (result.affectedRows === 0) {
                              console.error('No rows affected. Update failed.');
                              return res.status(404).send('Failed to update. No matching record found.');
                          }

                          res.json({ message: 'Image path updated successfully.', filePath });
                      });
                  });
              });
          } else {
              console.log('Inserting new image path');
              const insertQuery = 'INSERT INTO images (date, path, grade, Class, email, schoolCode) VALUES (?, ?, ?, ?, ?, ?)';
              console.log('Insert query:', insertQuery, [date, filePath, grade, Class, email, schoolCode]);

              db2.query(insertQuery, [date, filePath, grade, Class, email, schoolCode], (err, result) => {
                  if (err) {
                      console.error('Database insert error:', err);
                      return res.status(500).send('Database error.');
                  }
                  console.log('File uploaded and path inserted successfully. Insert ID:', result.insertId);
                  res.json({ message: 'File uploaded successfully.', filePath });
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
  db5.query(studentSql, [email], (err, studentResults) => {
    if (err) {
      console.error('Error fetching student info:', err);
      return res.status(500).send({ message: 'Failed to fetch student info' });
    } else if (studentResults.length === 0) {
      console.error('No student info found for email:', email);
      return res.status(404).send({ message: 'No student info found for the given email' });
    }

    const { Class, grade, schoolCode } = studentResults[0];
    console.log('Fetched student info:', { Class, grade, schoolCode });

    const selectQuery = 'SELECT path FROM images WHERE date = ? AND grade = ? AND Class = ? AND schoolCode = ?';
    db2.query(selectQuery, [date, grade, Class, schoolCode], (err, results) => {
      if (err) {
        console.error('Database query error:', err);
        return res.status(500).send('Database error.');
      }

      if (results.length > 0) {
        console.log('Image path found:', results[0].path);
        res.json({ imagePath: results[0].path });
      } else {
        console.error('Image not found.');
        res.status(404).send('Image not found.');
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

app.post('/uploadimg', upload2.single('file'), (req, res) => {
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

  const filePath2 = `/profileimg/${req.file.filename}`;

  const selectQuery = 'SELECT email FROM student WHERE email = ?';
  db5.query(selectQuery, [email], (err, results) => {
    if (err) {
      console.error('Database error:', err);
      return res.status(500).send('Database error.');
    }

    if (results.length > 0) {
      // 이메일이 존재하면 photoURL 업데이트
      const updateQuery = 'UPDATE student SET photoURL = ? WHERE email = ?';
      db5.query(updateQuery, [filePath2, email], (updateErr, updateResults) => {
        if (updateErr) {
          console.error('Database error:', updateErr);
          return res.status(500).send('Database error.');
        }
        res.json({ message: 'Photo URL updated successfully.', filePath: filePath2 });
      });
    } else {
      // 이메일이 존재하지 않으면 에러 반환
      res.status(404).send('Email not found.');
    }
  });
});

app.get('/getimg', (req, res) => {
  const email = req.query.email; // 쿼리 파라미터에서 이메일 가져오기

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
      const imagePath = path.join(__dirname, photoURL);

      // 이미지 파일이 존재하는지 확인하고 클라이언트에 전송
      fs.access(imagePath, fs.constants.F_OK, (fsErr) => {
        if (fsErr) {
          console.error('File not found:', imagePath);
          return res.status(404).send('File not found.');
        }

        res.sendFile(imagePath);
      });
    } else {
      res.status(404).send('Email not found.');
    }
  });
});


