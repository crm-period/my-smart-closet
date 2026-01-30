require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const path = require('path');
const multer = require('multer');
const cloudinary = require('cloudinary').v2;
const { OpenAI } = require('openai');

const app = express();
// הגדרת Multer לאחסון זמני של קבצים
const storage = multer.memoryStorage();
const upload = multer({ storage: storage });

// הגדרת Cloudinary
cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET
});

// הגדרת OpenAI
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

app.use(express.json());

// הגדרת תיקיית ה-public
const publicPath = path.join(__dirname, 'public');
app.use(express.static(publicPath));

// חיבור ל-MongoDB
mongoose.connect(process.env.MONGO_URI)
  .then(() => console.log('✅ Connected to MongoDB Atlas'))
  .catch(err => console.error('❌ MongoDB Connection Error:', err));

// הגדרת המודל של הבגד
const Garment = mongoose.model('Garment', new mongoose.Schema({
    type: String,
    color: String,
    category: String,
    isClean: { type: Boolean, default: true },
    imageUrl: { type: String, default: '' }, // <-- הוסף את זה
    description: { type: String, default: '' } // <-- וגם את זה
}));

// --- נתיבים (Routes) ---

// 1. דף הבית - שליחת ה-HTML
// הנתיב הראשי
app.get('/', (req, res) => {
    const indexPath = path.resolve(__dirname, 'public', 'index.html');
    console.log("🔍 השרת מחפש את הקובץ כאן: " + indexPath);
    
    res.sendFile(indexPath, (err) => {
        if (err) {
            console.error("❌ טעות! הקובץ לא נמצא בנתיב שצוין למעלה.");
            res.status(404).send(`
                <div style="direction: rtl; text-align: center; font-family: sans-serif;">
                    <h1>הקובץ index.html לא נמצא!</h1>
                    <p>השרת מחפש אותו בכתובת הזו במחשב שלך:</p>
                    <code style="background: #eee; padding: 5px;">${indexPath}</code>
                    <p>וודא שהתיקייה <b>public</b> קיימת והקובץ בפנים.</p>
                </div>
            `);
        }
    });
});
// 1. קבלת כל הבגדים (GET)
app.get('/api/clothes', async (req, res) => {
    try {
        const clothes = await Garment.find();
        res.json(clothes);
    } catch (err) {
        res.status(500).json({ error: "שגיאה בטעינת הבגדים" });
    }
});

// 2. הוספת בגד חדש (POST) - חשוב בשביל הטופס!
app.post('/api/clothes', async (req, res) => {
    try {
        const newGarment = new Garment(req.body);
        await newGarment.save();
        res.json(newGarment);
    } catch (err) {
        res.status(500).json({ error: "שגיאה בשמירת הבגד" });
    }
});
// מחיקת בגד לפי ה-ID שלו
app.delete('/api/clothes/:id', async (req, res) => {
    try {
        await Garment.findByIdAndDelete(req.params.id);
        res.json({ message: "הפריט נמחק בהצלחה" });
    } catch (err) {
        res.status(500).json({ error: "שגיאה במחיקה" });
    }
});

// 3. מילוי הארון (Seed)
app.get('/api/seed', async (req, res) => {
    try {
        // השורה הזו מוחקת את כל הבגדים הקיימים לפני שהיא מוסיפה חדשים
        await Garment.deleteMany({}); 
        
        const clothes = [
            { type: "מכנסיים מחויטים", color: "שחור", category: "ערב" },
            { type: "חולצה מכופתרת", color: "תכלת", category: "ערב" },
            { type: "ג'ינס", color: "כחול כהה", category: "יומיום" },
            { type: "טי-שירט", color: "אפור", category: "יומיום" },
            { type: "סניקרס", color: "לבן", category: "יומיום" },
            { type: "חצאית", color: "ירוק", category: "ערב" }
        ];
        
        await Garment.insertMany(clothes);
        res.send("<h1>הארון נוקה ומולא מחדש ב-6 פריטים בלבד!</h1><a href='/'>חזור לדף הבית</a>");
    } catch (err) {
        res.status(500).send("שגיאה בניקוי הארון");
    }
});
// לוגיקת הסטייליסט - מציאת התאמה
app.get('/api/suggest/:id', async (req, res) => {
    try {
        const selectedItem = await Garment.findById(req.params.id);
        
        // הגדרת חיפוש: קטגוריה זהה, אבל סוג שונה
        let matchQuery = { 
            _id: { $ne: selectedItem._id }, // שלא ימליץ על אותו פריט
            category: selectedItem.category 
        };

        // לוגיקה בסיסית: אם בחרת חולצה, נחפש מכנסיים/חצאית ולהיפך
        if (selectedItem.type.includes("חולצה") || selectedItem.type.includes("שירט")) {
            matchQuery.type = { $regex: "מכנסיים|ג'ינס|חצאית" };
        } else {
            matchQuery.type = { $regex: "חולצה|שירט|סוודר" };
        }

        const possibleMatches = await Garment.find(matchQuery);
        
        // בחירת התאמה אחת אקראית מתוך האפשרויות
        const randomMatch = possibleMatches[Math.floor(Math.random() * possibleMatches.length)];
        
        res.json(randomMatch || { message: "לא מצאתי התאמה מושלמת... אולי כדאי להוסיף עוד פריטים?" });
    } catch (err) {
        res.status(500).send("שגיאה בחיפוש התאמה");
    }
});
// נתיב חדש להעלאת תמונה, ניתוח AI ושמירה
app.post('/api/upload-garment', upload.single('garmentImage'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ error: 'אין קובץ תמונה' });
        }

        // 1. העלאת התמונה ל-Cloudinary
        const result = await new Promise((resolve, reject) => {
            const uploadStream = cloudinary.uploader.upload_stream({ folder: "closet_ai" }, (error, result) => {
                if (error) reject(error);
                resolve(result);
            });
            uploadStream.end(req.file.buffer);
        });

        const imageUrl = result.secure_url;

        // 2. שליחת התמונה ל-OpenAI לניתוח
        const response = await openai.chat.completions.create({
            model: "gpt-4o", // או gpt-4-vision-preview אם יש לך גישה לגרסה הישנה
            messages: [
                {
                    role: "user",
                    content: [
                        { type: "text", text: "תאר את הבגד בתמונה. ציין בבירור: 1. סוג הבגד (חולצה, מכנסיים, חצאית, נעליים, שמלה וכו'). 2. צבעים עיקריים. 3. קטגוריה (יומיום, ערב, ספורט, אלגנטי, קז'ואל). 4. תיאור כללי קצר. השב בפורמט JSON בלבד: { \"type\": \"...\", \"color\": \"...\", \"category\": \"...\", \"description\": \"...\" }" },
                        {
                            type: "image_url",
                            image_url: {
                                url: imageUrl,
                            },
                        },
                    ],
                },
            ],
            max_tokens: 300,
        });

        const aiDescriptionText = response.choices[0].message.content;
        let aiParsedData;
        try {
            // ניקוי הטקסט: הסרת סימני Markdown של בלוק קוד אם קיימים
            const cleanJson = aiDescriptionText.replace(/```json|```/g, "").trim();
            aiParsedData = JSON.parse(cleanJson);
        } catch (parseError) {
            console.error("שגיאת JSON מ-OpenAI:", aiDescriptionText);
            return res.status(500).json({ error: "שגיאה בניתוח תגובת AI", rawResponse: aiDescriptionText });
        }
        
        // 3. שמירה ב-MongoDB
        const newGarment = new Garment({
            type: aiParsedData.type || 'לא זוהה',
            color: aiParsedData.color || 'לא זוהה',
            category: aiParsedData.category || 'לא זוהה',
            imageUrl: imageUrl, // נוסיף שדה חדש לתמונה
            description: aiParsedData.description || ''
        });
        await newGarment.save();

        res.json({ message: 'הבגד הועלה ונותח בהצלחה!', garment: newGarment });

    } catch (err) {
        console.error("שגיאת העלאה או AI:", err);
        res.status(500).json({ error: "שגיאה במהלך העלאת התמונה או ניתוח ה-AI" });
    }
});

// הפעלת השרת
app.listen(3000, () => {
    console.log('🚀 השרת רץ בכתובת: http://localhost:3000');
});