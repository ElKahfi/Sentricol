const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path')
const {parseEnv}=require('node:util'),{Pool}=require('pg')
test('Database monitoring isolates companies, computes course progress, deduplicates risks and scopes acknowledgements',async()=>{
 const env=parseEnv(fs.readFileSync(path.join(__dirname,'../.env.local'),'utf8'))
 const pool=new Pool({connectionString:process.env.DATABASE_URL||env.DATABASE_URL,max:1,connectionTimeoutMillis:10000})
 let client
 try{
  client=await pool.connect();await client.query('BEGIN');await client.query('SET LOCAL search_path TO pg_temp')
  await client.query(`CREATE TEMP TABLE companies(company_id INT PRIMARY KEY,company_name TEXT);
   CREATE TEMP TABLE departments(department_id INT PRIMARY KEY,company_id INT,department_name TEXT);
   CREATE TEMP TABLE employees(employee_id INT PRIMARY KEY,department_id INT,full_name TEXT,work_email TEXT,is_active BOOLEAN);
   CREATE TEMP TABLE users(user_id INT PRIMARY KEY,employee_id INT,email TEXT,role TEXT,last_login_at TIMESTAMPTZ);
   CREATE TEMP TABLE user_progress(user_id INT,experience INT,average_score NUMERIC,updated_at TIMESTAMPTZ);
   CREATE TEMP TABLE task_assignments(user_id INT,status TEXT,completed_at TIMESTAMPTZ);
   CREATE TEMP TABLE email_course_enrollments(enrollment_id INT,user_id INT,company_id INT,state JSONB,updated_at TIMESTAMPTZ);
   INSERT INTO companies VALUES(1,'One'),(2,'Two');
   INSERT INTO departments VALUES(1,1,'IT'),(2,2,'Finance');
   INSERT INTO employees VALUES(1,1,'Alice','alice@example.test',true),(2,2,'Bob','bob@example.test',true),(3,1,'Admin','admin@example.test',true);
   INSERT INTO users VALUES(1,1,'alice@example.test','player',now()),(2,2,'bob@example.test','player',now()),(3,3,'admin@example.test','admin',now());
   INSERT INTO user_progress VALUES(1,25,80,now()),(2,10,70,now());
   INSERT INTO task_assignments VALUES(1,'completed',now());`)
  await client.query(fs.readFileSync(path.join(__dirname,'../database/migrations/003_company_monitoring.sql'),'utf8').replaceAll('CREATE TABLE IF NOT EXISTS','CREATE TEMP TABLE IF NOT EXISTS'))
  await client.query('INSERT INTO email_course_enrollments VALUES(1,1,1,$1,now())',[{phase:'normal',status:'active',slots:[{earnedUnits:250000000,assignments:[{submissions:[{feedback:{terminal:true}}]}]}]}])
  const load=require('./load-typescript.cjs')({'./db':{database:()=>client,transaction:work=>work(client)}})
  const {recordProtocolEvent}=load('src/lib/protocol-events.ts'),{companyMonitoring,acknowledgeAlert}=load('src/lib/monitoring.ts')
  const event={type:'risk',email:'alice@example.test',eventKey:'a'.repeat(64),severity:'high-risk',detectedAt:new Date().toISOString()}
  await recordProtocolEvent(event);await recordProtocolEvent(event)
  const one=await companyMonitoring('1'),two=await companyMonitoring('2')
  assert.equal(one.employees.length,1);assert.equal(one.employees[0].progress,25);assert.equal(one.employees[0].completedTasks,2)
  assert.equal(one.risk.total,1);assert.equal(one.risk.open,1);assert.equal(two.risk.total,0)
  assert.equal(two.employees[0].progress,null);assert.equal(one.alerts[0].name,'Alice')
  await assert.rejects(acknowledgeAlert('2','3',one.alerts[0].id),error=>error.status===404)
  await acknowledgeAlert('1','3',one.alerts[0].id)
  assert.equal((await companyMonitoring('1')).risk.open,0)
  await assert.rejects(recordProtocolEvent({...event,email:'unknown@example.test'}),error=>error.status===404)
 }finally{if(client){await client.query('ROLLBACK');client.release()}await pool.end()}
})
