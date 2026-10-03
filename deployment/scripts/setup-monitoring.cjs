const fs=require('node:fs'),path=require('node:path'),{parseEnv}=require('node:util'),{Pool}=require('pg')
const envPath=path.join(__dirname,'../.env.local')
const env=fs.existsSync(envPath)?parseEnv(fs.readFileSync(envPath,'utf8')):{}
const pool=new Pool({connectionString:process.env.DATABASE_URL||env.DATABASE_URL,connectionTimeoutMillis:10000,max:1})
async function main(){
 if(!(process.env.DATABASE_URL||env.DATABASE_URL)) throw Error('Database not configured')
 await pool.query(fs.readFileSync(path.join(__dirname,'../database/migrations/003_company_monitoring.sql'),'utf8'))
 console.log('Company monitoring schema ready. Existing employees and training progress preserved.')
}
main().catch(e=>{console.error('Monitoring setup failed:',e.code||e.message);process.exitCode=1}).finally(()=>pool.end())
