-- CreateEnum
CREATE TYPE "FollowUpPriority" AS ENUM ('low', 'medium', 'high', 'urgent');

-- CreateEnum
CREATE TYPE "FollowUpRecommendationStatus" AS ENUM ('draft', 'pending_review', 'approved', 'sent', 'dismissed', 'expired');

-- CreateTable
CREATE TABLE "followup_recommendations" (
    "id" TEXT NOT NULL,
    "conversation_id" TEXT,
    "external_user_id" TEXT,
    "contact_identifier" TEXT NOT NULL,
    "contact_name" TEXT,
    "reason" TEXT NOT NULL,
    "reason_detail" TEXT NOT NULL,
    "suggested_message" TEXT NOT NULL,
    "priority" "FollowUpPriority" NOT NULL DEFAULT 'medium',
    "next_action_date" TIMESTAMP(3) NOT NULL,
    "channel" TEXT,
    "status" "FollowUpRecommendationStatus" NOT NULL DEFAULT 'draft',
    "approved_at" TIMESTAMP(3),
    "sent_at" TIMESTAMP(3),
    "dismissed_at" TIMESTAMP(3),
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "followup_recommendations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "followup_recommendations_status_idx" ON "followup_recommendations"("status");

-- CreateIndex
CREATE INDEX "followup_recommendations_conversation_id_status_idx" ON "followup_recommendations"("conversation_id", "status");

-- CreateIndex
CREATE INDEX "followup_recommendations_contact_identifier_idx" ON "followup_recommendations"("contact_identifier");

-- CreateIndex
CREATE INDEX "followup_recommendations_next_action_date_idx" ON "followup_recommendations"("next_action_date");

-- CreateIndex
CREATE INDEX "followup_recommendations_priority_status_idx" ON "followup_recommendations"("priority", "status");
