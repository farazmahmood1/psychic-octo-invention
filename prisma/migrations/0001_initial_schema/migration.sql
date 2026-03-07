-- CreateEnum
CREATE TYPE "AdminRole" AS ENUM ('super_admin', 'admin', 'viewer');

-- CreateEnum
CREATE TYPE "ChannelType" AS ENUM ('telegram', 'email', 'admin_portal');

-- CreateEnum
CREATE TYPE "MessageDirection" AS ENUM ('inbound', 'outbound');

-- CreateEnum
CREATE TYPE "MessageStatus" AS ENUM ('pending', 'sent', 'delivered', 'failed', 'received');

-- CreateEnum
CREATE TYPE "ConversationStatus" AS ENUM ('active', 'archived', 'closed');

-- CreateEnum
CREATE TYPE "SkillSourceType" AS ENUM ('builtin', 'uploaded', 'git_repo', 'marketplace');

-- CreateEnum
CREATE TYPE "VettingResult" AS ENUM ('passed', 'failed', 'warning', 'pending');

-- CreateEnum
CREATE TYPE "VettingReviewerType" AS ENUM ('system', 'manual');

-- CreateEnum
CREATE TYPE "JobStatus" AS ENUM ('pending', 'running', 'completed', 'failed', 'retrying', 'cancelled');

-- CreateEnum
CREATE TYPE "IntegrationStatus" AS ENUM ('active', 'inactive', 'error');

-- CreateEnum
CREATE TYPE "ReceiptStatus" AS ENUM ('pending', 'extracted', 'exported', 'failed');

-- CreateEnum
CREATE TYPE "LedgerExportStatus" AS ENUM ('pending', 'exported', 'failed');

-- CreateEnum
CREATE TYPE "GhlActionType" AS ENUM ('create_contact', 'update_contact', 'create_opportunity', 'add_note', 'send_sms', 'custom');

-- CreateEnum
CREATE TYPE "SubAgentTaskStatus" AS ENUM ('queued', 'running', 'completed', 'failed', 'cancelled');

-- CreateTable
CREATE TABLE "admins" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "password_hash" TEXT NOT NULL,
    "display_name" TEXT,
    "role" "AdminRole" NOT NULL DEFAULT 'admin',
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "last_login_at" TIMESTAMP(3),
    "last_login_ip" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "admins_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "admin_sessions" (
    "id" TEXT NOT NULL,
    "admin_id" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "ip_address" TEXT,
    "user_agent" TEXT,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "admin_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "conversations" (
    "id" TEXT NOT NULL,
    "channel" "ChannelType" NOT NULL,
    "external_id" TEXT,
    "title" TEXT,
    "status" "ConversationStatus" NOT NULL DEFAULT 'active',
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "conversations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "participants" (
    "id" TEXT NOT NULL,
    "conversation_id" TEXT NOT NULL,
    "external_id" TEXT,
    "channel" "ChannelType" NOT NULL,
    "display_name" TEXT,
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "participants_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "messages" (
    "id" TEXT NOT NULL,
    "conversation_id" TEXT NOT NULL,
    "participant_id" TEXT,
    "direction" "MessageDirection" NOT NULL,
    "status" "MessageStatus" NOT NULL DEFAULT 'pending',
    "raw_content" TEXT,
    "content" TEXT NOT NULL,
    "attachments" JSONB,
    "provider_message_id" TEXT,
    "metadata" JSONB,
    "token_usage" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "messages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "telegram_chats" (
    "id" TEXT NOT NULL,
    "conversation_id" TEXT NOT NULL,
    "telegram_chat_id" TEXT NOT NULL,
    "telegram_user_id" TEXT,
    "username" TEXT,
    "first_name" TEXT,
    "last_name" TEXT,
    "chat_type" TEXT,
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "telegram_chats_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "email_threads" (
    "id" TEXT NOT NULL,
    "conversation_id" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "thread_id" TEXT,
    "from_address" TEXT NOT NULL,
    "to_addresses" JSONB NOT NULL,
    "last_message_at" TIMESTAMP(3) NOT NULL,
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "email_threads_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "email_messages" (
    "id" TEXT NOT NULL,
    "email_thread_id" TEXT NOT NULL,
    "message_id" TEXT,
    "provider_email_id" TEXT,
    "in_reply_to" TEXT,
    "from_address" TEXT NOT NULL,
    "to_addresses" JSONB NOT NULL,
    "cc_addresses" JSONB,
    "subject" TEXT,
    "body_text" TEXT,
    "body_html" TEXT,
    "headers" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "email_messages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "memory_records" (
    "id" TEXT NOT NULL,
    "namespace" TEXT NOT NULL,
    "subject_key" TEXT NOT NULL,
    "value" JSONB NOT NULL,
    "summary" TEXT,
    "score" DOUBLE PRECISION,
    "source_conversation_id" TEXT,
    "source_message_id" TEXT,
    "expires_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "memory_records_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "skills" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "display_name" TEXT NOT NULL,
    "description" TEXT,
    "source_type" "SkillSourceType" NOT NULL,
    "source_url" TEXT,
    "source_ref" TEXT,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "current_version_id" TEXT,
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "skills_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "skill_versions" (
    "id" TEXT NOT NULL,
    "skill_id" TEXT NOT NULL,
    "version" TEXT NOT NULL,
    "code_hash" TEXT NOT NULL,
    "config" JSONB,
    "changelog" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "skill_versions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "skill_vetting_results" (
    "id" TEXT NOT NULL,
    "skill_version_id" TEXT NOT NULL,
    "result" "VettingResult" NOT NULL,
    "reviewer_type" "VettingReviewerType" NOT NULL,
    "reasons" JSONB,
    "detected_risks" JSONB,
    "code_hash" TEXT NOT NULL,
    "reviewer_note" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "skill_vetting_results_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" TEXT NOT NULL,
    "actor_id" TEXT,
    "actor_type" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "target_type" TEXT,
    "target_id" TEXT,
    "metadata" JSONB,
    "ip_address" TEXT,
    "user_agent" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "usage_logs" (
    "id" TEXT NOT NULL,
    "message_id" TEXT,
    "provider" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "request_type" TEXT NOT NULL,
    "prompt_tokens" INTEGER NOT NULL,
    "completion_tokens" INTEGER NOT NULL,
    "total_tokens" INTEGER NOT NULL,
    "cost_usd" DECIMAL(12,8) NOT NULL,
    "latency_ms" INTEGER,
    "routing_decision" JSONB,
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "usage_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "jobs" (
    "id" TEXT NOT NULL,
    "queue_name" TEXT NOT NULL,
    "job_type" TEXT NOT NULL,
    "payload" JSONB,
    "status" "JobStatus" NOT NULL DEFAULT 'pending',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "max_attempts" INTEGER NOT NULL DEFAULT 3,
    "error_details" JSONB,
    "result" JSONB,
    "started_at" TIMESTAMP(3),
    "completed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "jobs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "integrations" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "config" JSONB,
    "status" "IntegrationStatus" NOT NULL DEFAULT 'inactive',
    "last_sync_at" TIMESTAMP(3),
    "last_error" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "integrations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "receipt_extractions" (
    "id" TEXT NOT NULL,
    "conversation_id" TEXT,
    "external_user_id" TEXT,
    "source_channel" "ChannelType" NOT NULL,
    "source_message_id" TEXT,
    "idempotency_key" TEXT,
    "file_name" TEXT,
    "file_url" TEXT,
    "file_type" TEXT,
    "extracted_data" JSONB,
    "category" TEXT,
    "confidence" DOUBLE PRECISION,
    "status" "ReceiptStatus" NOT NULL DEFAULT 'pending',
    "error_details" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "receipt_extractions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ledger_exports" (
    "id" TEXT NOT NULL,
    "receipt_extraction_id" TEXT NOT NULL,
    "spreadsheet_id" TEXT NOT NULL,
    "sheet_name" TEXT,
    "row_range" TEXT,
    "exported_data" JSONB,
    "status" "LedgerExportStatus" NOT NULL DEFAULT 'pending',
    "error_details" TEXT,
    "exported_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ledger_exports_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ghl_action_logs" (
    "id" TEXT NOT NULL,
    "action_type" "GhlActionType" NOT NULL,
    "contact_id" TEXT,
    "opportunity_id" TEXT,
    "request_payload" JSONB,
    "response_payload" JSONB,
    "status_code" INTEGER,
    "success" BOOLEAN NOT NULL,
    "error_message" TEXT,
    "latency_ms" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ghl_action_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sub_agent_tasks" (
    "id" TEXT NOT NULL,
    "agent_name" TEXT NOT NULL,
    "task_type" TEXT NOT NULL,
    "input" JSONB,
    "output" JSONB,
    "status" "SubAgentTaskStatus" NOT NULL DEFAULT 'queued',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "error_details" JSONB,
    "parent_job_id" TEXT,
    "started_at" TIMESTAMP(3),
    "completed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sub_agent_tasks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "system_settings" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "value" JSONB NOT NULL,
    "description" TEXT,
    "updated_by" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "system_settings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "admins_email_key" ON "admins"("email");

-- CreateIndex
CREATE UNIQUE INDEX "admin_sessions_token_key" ON "admin_sessions"("token");

-- CreateIndex
CREATE INDEX "admin_sessions_admin_id_idx" ON "admin_sessions"("admin_id");

-- CreateIndex
CREATE INDEX "admin_sessions_expires_at_idx" ON "admin_sessions"("expires_at");

-- CreateIndex
CREATE INDEX "conversations_channel_idx" ON "conversations"("channel");

-- CreateIndex
CREATE INDEX "conversations_status_idx" ON "conversations"("status");

-- CreateIndex
CREATE INDEX "conversations_created_at_idx" ON "conversations"("created_at");

-- CreateIndex
CREATE UNIQUE INDEX "conversations_channel_external_id_key" ON "conversations"("channel", "external_id");

-- CreateIndex
CREATE INDEX "participants_conversation_id_idx" ON "participants"("conversation_id");

-- CreateIndex
CREATE UNIQUE INDEX "participants_conversation_id_channel_external_id_key" ON "participants"("conversation_id", "channel", "external_id");

-- CreateIndex
CREATE INDEX "messages_conversation_id_created_at_idx" ON "messages"("conversation_id", "created_at");

-- CreateIndex
CREATE INDEX "messages_provider_message_id_idx" ON "messages"("provider_message_id");

-- CreateIndex
CREATE INDEX "messages_status_idx" ON "messages"("status");

-- CreateIndex
CREATE UNIQUE INDEX "telegram_chats_conversation_id_key" ON "telegram_chats"("conversation_id");

-- CreateIndex
CREATE UNIQUE INDEX "telegram_chats_telegram_chat_id_key" ON "telegram_chats"("telegram_chat_id");

-- CreateIndex
CREATE INDEX "telegram_chats_telegram_user_id_idx" ON "telegram_chats"("telegram_user_id");

-- CreateIndex
CREATE UNIQUE INDEX "email_threads_conversation_id_key" ON "email_threads"("conversation_id");

-- CreateIndex
CREATE UNIQUE INDEX "email_threads_thread_id_key" ON "email_threads"("thread_id");

-- CreateIndex
CREATE INDEX "email_threads_from_address_idx" ON "email_threads"("from_address");

-- CreateIndex
CREATE UNIQUE INDEX "email_messages_message_id_key" ON "email_messages"("message_id");

-- CreateIndex
CREATE UNIQUE INDEX "email_messages_provider_email_id_key" ON "email_messages"("provider_email_id");

-- CreateIndex
CREATE INDEX "email_messages_email_thread_id_idx" ON "email_messages"("email_thread_id");

-- CreateIndex
CREATE INDEX "email_messages_from_address_idx" ON "email_messages"("from_address");

-- CreateIndex
CREATE INDEX "memory_records_namespace_subject_key_idx" ON "memory_records"("namespace", "subject_key");

-- CreateIndex
CREATE INDEX "memory_records_namespace_created_at_idx" ON "memory_records"("namespace", "created_at");

-- CreateIndex
CREATE INDEX "memory_records_expires_at_idx" ON "memory_records"("expires_at");

-- CreateIndex
CREATE UNIQUE INDEX "skills_slug_key" ON "skills"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "skills_current_version_id_key" ON "skills"("current_version_id");

-- CreateIndex
CREATE INDEX "skills_enabled_idx" ON "skills"("enabled");

-- CreateIndex
CREATE INDEX "skill_versions_skill_id_idx" ON "skill_versions"("skill_id");

-- CreateIndex
CREATE UNIQUE INDEX "skill_versions_skill_id_version_key" ON "skill_versions"("skill_id", "version");

-- CreateIndex
CREATE INDEX "skill_vetting_results_skill_version_id_idx" ON "skill_vetting_results"("skill_version_id");

-- CreateIndex
CREATE INDEX "skill_vetting_results_result_idx" ON "skill_vetting_results"("result");

-- CreateIndex
CREATE INDEX "audit_logs_action_created_at_idx" ON "audit_logs"("action", "created_at");

-- CreateIndex
CREATE INDEX "audit_logs_actor_id_idx" ON "audit_logs"("actor_id");

-- CreateIndex
CREATE INDEX "audit_logs_target_type_target_id_idx" ON "audit_logs"("target_type", "target_id");

-- CreateIndex
CREATE INDEX "audit_logs_created_at_idx" ON "audit_logs"("created_at");

-- CreateIndex
CREATE UNIQUE INDEX "usage_logs_message_id_key" ON "usage_logs"("message_id");

-- CreateIndex
CREATE INDEX "usage_logs_provider_model_created_at_idx" ON "usage_logs"("provider", "model", "created_at");

-- CreateIndex
CREATE INDEX "usage_logs_created_at_idx" ON "usage_logs"("created_at");

-- CreateIndex
CREATE INDEX "jobs_status_idx" ON "jobs"("status");

-- CreateIndex
CREATE INDEX "jobs_queue_name_status_idx" ON "jobs"("queue_name", "status");

-- CreateIndex
CREATE INDEX "jobs_job_type_idx" ON "jobs"("job_type");

-- CreateIndex
CREATE INDEX "jobs_created_at_idx" ON "jobs"("created_at");

-- CreateIndex
CREATE UNIQUE INDEX "integrations_name_key" ON "integrations"("name");

-- CreateIndex
CREATE INDEX "integrations_status_idx" ON "integrations"("status");

-- CreateIndex
CREATE UNIQUE INDEX "receipt_extractions_idempotency_key_key" ON "receipt_extractions"("idempotency_key");

-- CreateIndex
CREATE INDEX "receipt_extractions_status_idx" ON "receipt_extractions"("status");

-- CreateIndex
CREATE INDEX "receipt_extractions_source_channel_created_at_idx" ON "receipt_extractions"("source_channel", "created_at");

-- CreateIndex
CREATE INDEX "receipt_extractions_conversation_id_status_idx" ON "receipt_extractions"("conversation_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "ledger_exports_receipt_extraction_id_key" ON "ledger_exports"("receipt_extraction_id");

-- CreateIndex
CREATE INDEX "ledger_exports_status_idx" ON "ledger_exports"("status");

-- CreateIndex
CREATE INDEX "ghl_action_logs_action_type_created_at_idx" ON "ghl_action_logs"("action_type", "created_at");

-- CreateIndex
CREATE INDEX "ghl_action_logs_contact_id_idx" ON "ghl_action_logs"("contact_id");

-- CreateIndex
CREATE INDEX "ghl_action_logs_success_idx" ON "ghl_action_logs"("success");

-- CreateIndex
CREATE INDEX "sub_agent_tasks_agent_name_status_idx" ON "sub_agent_tasks"("agent_name", "status");

-- CreateIndex
CREATE INDEX "sub_agent_tasks_status_idx" ON "sub_agent_tasks"("status");

-- CreateIndex
CREATE INDEX "sub_agent_tasks_parent_job_id_idx" ON "sub_agent_tasks"("parent_job_id");

-- CreateIndex
CREATE INDEX "sub_agent_tasks_created_at_idx" ON "sub_agent_tasks"("created_at");

-- CreateIndex
CREATE UNIQUE INDEX "system_settings_key_key" ON "system_settings"("key");

-- AddForeignKey
ALTER TABLE "admin_sessions" ADD CONSTRAINT "admin_sessions_admin_id_fkey" FOREIGN KEY ("admin_id") REFERENCES "admins"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "participants" ADD CONSTRAINT "participants_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "conversations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "messages" ADD CONSTRAINT "messages_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "conversations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "messages" ADD CONSTRAINT "messages_participant_id_fkey" FOREIGN KEY ("participant_id") REFERENCES "participants"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "telegram_chats" ADD CONSTRAINT "telegram_chats_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "conversations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "email_threads" ADD CONSTRAINT "email_threads_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "conversations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "email_messages" ADD CONSTRAINT "email_messages_email_thread_id_fkey" FOREIGN KEY ("email_thread_id") REFERENCES "email_threads"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "email_messages" ADD CONSTRAINT "email_messages_message_id_fkey" FOREIGN KEY ("message_id") REFERENCES "messages"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "memory_records" ADD CONSTRAINT "memory_records_source_conversation_id_fkey" FOREIGN KEY ("source_conversation_id") REFERENCES "conversations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "skills" ADD CONSTRAINT "skills_current_version_id_fkey" FOREIGN KEY ("current_version_id") REFERENCES "skill_versions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "skill_versions" ADD CONSTRAINT "skill_versions_skill_id_fkey" FOREIGN KEY ("skill_id") REFERENCES "skills"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "skill_vetting_results" ADD CONSTRAINT "skill_vetting_results_skill_version_id_fkey" FOREIGN KEY ("skill_version_id") REFERENCES "skill_versions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "admins"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "usage_logs" ADD CONSTRAINT "usage_logs_message_id_fkey" FOREIGN KEY ("message_id") REFERENCES "messages"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ledger_exports" ADD CONSTRAINT "ledger_exports_receipt_extraction_id_fkey" FOREIGN KEY ("receipt_extraction_id") REFERENCES "receipt_extractions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

