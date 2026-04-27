import mysql from "mysql2/promise";

const conn = await mysql.createConnection(process.env.DATABASE_URL);

const sqls = [
  `CREATE TABLE IF NOT EXISTS \`learningSessions\` (
    \`id\` int AUTO_INCREMENT NOT NULL,
    \`userId\` int NOT NULL,
    \`documentId\` int NOT NULL,
    \`startTopicId\` varchar(128),
    \`startTopicTitle\` varchar(512),
    \`status\` enum('active','completed','paused') NOT NULL DEFAULT 'active',
    \`completedTopics\` json,
    \`currentTopicId\` varchar(128),
    \`totalQuestions\` int DEFAULT 0,
    \`answeredQuestions\` int DEFAULT 0,
    \`summary\` text,
    \`reportSent\` int DEFAULT 0,
    \`createdAt\` timestamp NOT NULL DEFAULT (now()),
    \`updatedAt\` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
    \`completedAt\` timestamp,
    CONSTRAINT \`learningSessions_id\` PRIMARY KEY(\`id\`)
  )`,
  `CREATE TABLE IF NOT EXISTS \`sessionMessages\` (
    \`id\` int AUTO_INCREMENT NOT NULL,
    \`sessionId\` int NOT NULL,
    \`role\` enum('ai','user') NOT NULL,
    \`messageType\` enum('question','answer','feedback','user_question','ai_answer','system') NOT NULL,
    \`content\` text NOT NULL,
    \`topicId\` varchar(128),
    \`topicTitle\` varchar(512),
    \`questionIndex\` int,
    \`createdAt\` timestamp NOT NULL DEFAULT (now()),
    CONSTRAINT \`sessionMessages_id\` PRIMARY KEY(\`id\`)
  )`,
];

for (const sql of sqls) {
  try {
    await conn.execute(sql);
    console.log("✓ Table created");
  } catch (e) {
    console.error("Error:", e.message);
  }
}

await conn.end();
console.log("Done.");
