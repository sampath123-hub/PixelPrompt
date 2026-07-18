import "dotenv/config";
import express from "express";
import cors from "cors";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";

fs.mkdirSync("data", { recursive: true });
const db = new Database(path.resolve("data/pixelprompt.db"));
db.pragma("foreign_keys = ON");
db.exec(`
CREATE TABLE IF NOT EXISTS users(id INTEGER PRIMARY KEY AUTOINCREMENT,name TEXT NOT NULL,email TEXT UNIQUE NOT NULL,password_hash TEXT NOT NULL,created_at TEXT DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS prompts(id INTEGER PRIMARY KEY AUTOINCREMENT,user_id INTEGER NOT NULL,title TEXT NOT NULL,subject TEXT NOT NULL,model TEXT NOT NULL,prompt_text TEXT NOT NULL,negative_prompt TEXT DEFAULT '',is_favorite INTEGER DEFAULT 0,is_public INTEGER DEFAULT 0,created_at TEXT DEFAULT CURRENT_TIMESTAMP,FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE);
`);

const app=express();
app.use(cors({origin:process.env.CLIENT_URL||"http://localhost:5173"}));
app.use(express.json());
const secret=process.env.JWT_SECRET||"PixelPromptSecret2026ChangeMe";
const tokenFor=id=>jwt.sign({userId:id},secret,{expiresIn:"7d"});
const auth=(req,res,next)=>{const t=req.headers.authorization?.replace("Bearer ","");try{req.userId=jwt.verify(t,secret).userId;next()}catch{return res.status(401).json({message:"Login required"})}};
const mapPrompt=r=>({...r,is_favorite:Boolean(r.is_favorite),is_public:Boolean(r.is_public)});

app.get('/api/health',(req,res)=>res.json({status:'ok',message:'PixelPrompt API running'}));
app.post('/api/auth/register',async(req,res)=>{try{const name=String(req.body.name||'').trim(),email=String(req.body.email||'').trim().toLowerCase(),password=String(req.body.password||'');if(name.length<2||!/^\S+@\S+\.\S+$/.test(email)||password.length<6)return res.status(400).json({message:'Enter valid details; password needs 6 characters'});if(db.prepare('SELECT id FROM users WHERE email=?').get(email))return res.status(409).json({message:'Email already registered'});const hash=await bcrypt.hash(password,12);const r=db.prepare('INSERT INTO users(name,email,password_hash) VALUES(?,?,?)').run(name,email,hash);res.status(201).json({token:tokenFor(r.lastInsertRowid),user:{id:r.lastInsertRowid,name,email}})}catch(e){console.error(e);res.status(500).json({message:'Registration failed'})}});
app.post('/api/auth/login',async(req,res)=>{const email=String(req.body.email||'').trim().toLowerCase();const u=db.prepare('SELECT * FROM users WHERE email=?').get(email);if(!u||!(await bcrypt.compare(String(req.body.password||''),u.password_hash)))return res.status(401).json({message:'Invalid email or password'});res.json({token:tokenFor(u.id),user:{id:u.id,name:u.name,email:u.email}})});
app.get('/api/auth/me',auth,(req,res)=>{const u=db.prepare('SELECT id,name,email FROM users WHERE id=?').get(req.userId);res.json({user:u})});
app.post('/api/prompts/generate',(req,res)=>{const s=String(req.body.subject||'').trim();if(!s)return res.status(400).json({message:'Enter a subject'});const f=req.body;const prompt=[s,f.style||'Photorealistic',f.lighting||'Cinematic lighting',f.mood||'Immersive mood',f.camera||'Professional camera',f.background||'Detailed environment',f.palette||'Balanced colors',f.composition||'Professional composition',f.quality||'Ultra detailed',`aspect ratio ${f.aspectRatio||'1:1'}`,`optimized for ${f.model||'Universal'}`].join(', ');res.json({promptText:prompt,negativePrompt:'blurry, low quality, distorted anatomy, extra limbs, duplicate objects, watermark, logo, unwanted text, artifacts'})});
app.get('/api/prompts/public',(req,res)=>{const rows=db.prepare('SELECT p.*,u.name user_name FROM prompts p JOIN users u ON u.id=p.user_id WHERE p.is_public=1 ORDER BY p.id DESC LIMIT 100').all();res.json({prompts:rows.map(mapPrompt)})});
app.get('/api/prompts',auth,(req,res)=>{const rows=db.prepare('SELECT * FROM prompts WHERE user_id=? ORDER BY id DESC').all(req.userId);res.json({prompts:rows.map(mapPrompt)})});
app.get('/api/prompts/stats',auth,(req,res)=>{const r=db.prepare('SELECT COUNT(*) total,SUM(is_favorite) favorites,SUM(is_public) publicCount FROM prompts WHERE user_id=?').get(req.userId);res.json({total:r.total||0,favorites:r.favorites||0,publicCount:r.publicCount||0})});
app.post('/api/prompts',auth,(req,res)=>{const b=req.body;if(!b.subject||!b.promptText)return res.status(400).json({message:'Generate a prompt first'});const r=db.prepare('INSERT INTO prompts(user_id,title,subject,model,prompt_text,negative_prompt) VALUES(?,?,?,?,?,?)').run(req.userId,b.title||b.subject,b.subject,b.model||'Universal',b.promptText,b.negativePrompt||'');const p=db.prepare('SELECT * FROM prompts WHERE id=?').get(r.lastInsertRowid);res.status(201).json({prompt:mapPrompt(p)})});
app.patch('/api/prompts/:id',auth,(req,res)=>{const p=db.prepare('SELECT * FROM prompts WHERE id=? AND user_id=?').get(req.params.id,req.userId);if(!p)return res.status(404).json({message:'Not found'});const fav=req.body.isFavorite===undefined?p.is_favorite:req.body.isFavorite?1:0;const pub=req.body.isPublic===undefined?p.is_public:req.body.isPublic?1:0;db.prepare('UPDATE prompts SET is_favorite=?,is_public=? WHERE id=? AND user_id=?').run(fav,pub,req.params.id,req.userId);res.json({message:'Updated'})});
app.delete('/api/prompts/:id',auth,(req,res)=>{db.prepare('DELETE FROM prompts WHERE id=? AND user_id=?').run(req.params.id,req.userId);res.json({message:'Deleted'})});
app.listen(process.env.PORT||5000,()=>console.log('PixelPrompt backend running: http://localhost:5000'));
