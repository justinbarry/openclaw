---
name: linear
description: "Full Linear GraphQL API access via the linear tool. Use for any Linear operation: issues, projects, cycles, teams, comments, milestones, roadmaps, users, labels, relations, webhooks, and more."
metadata:
  {
    "openclaw":
      { "emoji": "📐", "primaryEnv": "LINEAR_API_KEY", "requires": { "env": ["LINEAR_API_KEY"] } },
  }
---

# Linear GraphQL API — Agent Reference

## Tools

### High-level helpers (use these first)

These cover the most common tasks without hand-crafting GraphQL:

| Tool                                                                                                                    | What it does                                                                                                                 |
| ----------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| `linear_get_project(query)`                                                                                             | Look up a project by name fragment, URL slug, or UUID. Returns id, description, content, status, milestones, recent updates. |
| `linear_update_project(id, description?, content?, name?, status_id?)`                                                  | Update a project's description, markdown body, name, or status.                                                              |
| `linear_create_project_update(project_id, body, health?)`                                                               | Post a status update to a project. `health`: `"onTrack"` \| `"atRisk"` \| `"offTrack"`.                                      |
| `linear_find_issue(query, team_key?)`                                                                                   | Search issues by text or exact identifier (`"ENG-42"`).                                                                      |
| `linear_update_issue(id, title?, description?, state_id?, assignee_id?, priority?, project_id?, due_date?, label_ids?)` | Update any fields on an issue. Pass `"null"` string to clear optional FK fields.                                             |
| `linear_get_team(query)`                                                                                                | Get a team by key (`"ENG"`) or name fragment — includes workflow states, labels, members, active cycle.                      |
| `linear_search_docs(term, project_id?)`                                                                                 | Search documents by keyword, optionally scoped to a project.                                                                 |
| `linear_manage_doc(...)`                                                                                                | Create (needs `title` + `project_id` or `issue_id`) or update (needs `doc_id`) a document. `content` is markdown.            |

### Raw GraphQL escape hatch

`linear(query: string, variables?: object) -> data`  
Executes any Linear GraphQL query or mutation. Pass the full GraphQL document as `query` and any input values as `variables`.

---

## Queries by Category

### Issues

| Operation                    | Signature                                                                                                                                                  |
| ---------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `issues`                     | `(filter: IssueFilter, first: Int, after: String, last: Int, before: String, includeArchived: Boolean, orderBy: PaginationOrderBy, sort): IssueConnection` |
| `issue`                      | `(id: String): Issue`                                                                                                                                      |
| `searchIssues`               | `(term: String, filter: IssueFilter, teamId: String, includeComments: Boolean, first: Int, after: String, ...): IssueSearchPayload`                        |
| `issueSearch` ⚠️ deprecated  | `(query: String, filter: IssueFilter, first: Int, after: String, ...): IssueConnection`                                                                    |
| `issueVcsBranchSearch`       | `(branchName: String): Issue`                                                                                                                              |
| `issueFigmaFileKeySearch`    | `(fileKey: String, first: Int, after: String, ...): IssueConnection`                                                                                       |
| `issueRelations`             | `(first: Int, after: String, ...): IssueRelationConnection`                                                                                                |
| `issueRelation`              | `(id: String): IssueRelation`                                                                                                                              |
| `issueLabels`                | `(filter: IssueLabelFilter, first: Int, after: String, ...): IssueLabelConnection`                                                                         |
| `issueLabel`                 | `(id: String): IssueLabel`                                                                                                                                 |
| `issuePriorityValues`        | `(): [{ priority, label }]`                                                                                                                                |
| `issueFilterSuggestion`      | `(teamId: String, projectId: String, prompt: String): IssueFilterSuggestionPayload`                                                                        |
| `issueRepositorySuggestions` | `(issueId: String, agentSessionId: String, candidateRepositories): RepositorySuggestionsPayload`                                                           |
| `issueImportCheckCSV`        | `(csvUrl: String, service: String): IssueImportCheckPayload`                                                                                               |
| `issueImportCheckSync`       | `(issueImportId: String): IssueImportSyncCheckPayload`                                                                                                     |
| `issueImportJqlCheck`        | `(jiraHostname, jiraToken, jiraEmail, jiraProject, jql): IssueImportJqlCheckPayload`                                                                       |

### Projects

| Operation                   | Signature                                                                                         |
| --------------------------- | ------------------------------------------------------------------------------------------------- |
| `projects`                  | `(filter: ProjectFilter, first: Int, after: String, sort, ...): ProjectConnection`                |
| `project`                   | `(id: String): Project`                                                                           |
| `searchProjects`            | `(term: String, teamId: String, includeComments: Boolean, first: Int, ...): ProjectSearchPayload` |
| `projectFilterSuggestion`   | `(teamId: String, prompt: String): ProjectFilterSuggestionPayload`                                |
| `projectUpdates`            | `(filter: ProjectUpdateFilter, first: Int, after: String, ...): ProjectUpdateConnection`          |
| `projectUpdate`             | `(id: String): ProjectUpdate`                                                                     |
| `projectStatuses`           | `(first: Int, after: String, ...): ProjectStatusConnection`                                       |
| `projectStatus`             | `(id: String): ProjectStatus`                                                                     |
| `projectStatusProjectCount` | `(id: String): ProjectStatusCountPayload`                                                         |
| `projectRelations`          | `(first: Int, after: String, ...): ProjectRelationConnection`                                     |
| `projectRelation`           | `(id: String): ProjectRelation`                                                                   |
| `projectMilestones`         | `(filter: ProjectMilestoneFilter, first: Int, after: String, ...): ProjectMilestoneConnection`    |
| `projectMilestone`          | `(id: String): ProjectMilestone`                                                                  |
| `projectLabels`             | `(filter: ProjectLabelFilter, first: Int, after: String, ...): ProjectLabelConnection`            |
| `projectLabel`              | `(id: String): ProjectLabel`                                                                      |

### Teams

| Operation            | Signature                                                              |
| -------------------- | ---------------------------------------------------------------------- |
| `teams`              | `(filter: TeamFilter, first: Int, after: String, ...): TeamConnection` |
| `team`               | `(id: String): Team`                                                   |
| `administrableTeams` | `(filter: TeamFilter, first: Int, after: String, ...): TeamConnection` |
| `teamMemberships`    | `(first: Int, after: String, ...): TeamMembershipConnection`           |
| `teamMembership`     | `(id: String): TeamMembership`                                         |

### Users

| Operation      | Signature                                                                                              |
| -------------- | ------------------------------------------------------------------------------------------------------ |
| `viewer`       | `(): User`                                                                                             |
| `user`         | `(id: String): User`                                                                                   |
| `users`        | `(filter: UserFilter, includeDisabled: Boolean, first: Int, after: String, sort, ...): UserConnection` |
| `userSettings` | `(): UserSettings`                                                                                     |
| `userSessions` | `(id: String): [sessions]` — admin/owner only                                                          |

### Workflow States

| Operation        | Signature                                                                                |
| ---------------- | ---------------------------------------------------------------------------------------- |
| `workflowStates` | `(filter: WorkflowStateFilter, first: Int, after: String, ...): WorkflowStateConnection` |
| `workflowState`  | `(id: String): WorkflowState`                                                            |

### Cycles

| Operation | Signature                                                                |
| --------- | ------------------------------------------------------------------------ |
| `cycles`  | `(filter: CycleFilter, first: Int, after: String, ...): CycleConnection` |
| `cycle`   | `(id: String): Cycle`                                                    |

### Comments

| Operation  | Signature                                                                    |
| ---------- | ---------------------------------------------------------------------------- |
| `comments` | `(filter: CommentFilter, first: Int, after: String, ...): CommentConnection` |
| `comment`  | `(id: String, hash: String): Comment`                                        |

### Documents

| Operation                | Signature                                                                                          |
| ------------------------ | -------------------------------------------------------------------------------------------------- |
| `documents`              | `(filter: DocumentFilter, first: Int, after: String, ...): DocumentConnection`                     |
| `document`               | `(id: String): Document`                                                                           |
| `searchDocuments`        | `(term: String, teamId: String, includeComments: Boolean, first: Int, ...): DocumentSearchPayload` |
| `documentContentHistory` | `(id: String): DocumentContentHistoryPayload`                                                      |

### Initiatives

| Operation              | Signature                                                                                      |
| ---------------------- | ---------------------------------------------------------------------------------------------- |
| `initiatives`          | `(filter: InitiativeFilter, first: Int, after: String, sort, ...): InitiativeConnection`       |
| `initiative`           | `(id: String): Initiative`                                                                     |
| `initiativeUpdates`    | `(filter: InitiativeUpdateFilter, first: Int, after: String, ...): InitiativeUpdateConnection` |
| `initiativeUpdate`     | `(id: String): InitiativeUpdate`                                                               |
| `initiativeToProjects` | `(first: Int, after: String, ...): InitiativeToProjectConnection`                              |
| `initiativeToProject`  | `(id: String): InitiativeToProject`                                                            |
| `initiativeRelations`  | `(first: Int, after: String, ...): InitiativeRelationConnection`                               |
| `initiativeRelation`   | `(id: String): ProjectRelation`                                                                |

### Customers & Needs

| Operation                                 | Signature                                                                              |
| ----------------------------------------- | -------------------------------------------------------------------------------------- |
| `customers`                               | `(filter: CustomerFilter, sorts, first: Int, after: String, ...): CustomerConnection`  |
| `customer`                                | `(id: String): Customer`                                                               |
| `customerNeeds`                           | `(filter: CustomerNeedFilter, first: Int, after: String, ...): CustomerNeedConnection` |
| `customerNeed`                            | `(id: String, hash: String): CustomerNeed`                                             |
| `customerStatuses`                        | `(first: Int, after: String, ...): CustomerStatusConnection`                           |
| `customerStatus`                          | `(id: String): CustomerStatus`                                                         |
| `customerTiers`                           | `(first: Int, after: String, ...): CustomerTierConnection`                             |
| `customerTier`                            | `(id: String): CustomerTier`                                                           |
| `issueTitleSuggestionFromCustomerRequest` | `(request: String): IssueTitleSuggestionFromCustomerRequestPayload`                    |

### Attachments

| Operation           | Signature                                                                          |
| ------------------- | ---------------------------------------------------------------------------------- |
| `attachments`       | `(filter: AttachmentFilter, first: Int, after: String, ...): AttachmentConnection` |
| `attachment`        | `(id: String): Attachment`                                                         |
| `attachmentsForURL` | `(url: String, first: Int, after: String, ...): AttachmentConnection`              |
| `attachmentSources` | `(teamId: String): AttachmentSourcesPayload`                                       |

### Notifications

| Operation                   | Signature                                                                              |
| --------------------------- | -------------------------------------------------------------------------------------- |
| `notifications`             | `(filter: NotificationFilter, first: Int, after: String, ...): NotificationConnection` |
| `notification`              | `(id: String): Notification`                                                           |
| `notificationsUnreadCount`  | `(): Int`                                                                              |
| `notificationSubscriptions` | `(first: Int, after: String, ...): NotificationSubscriptionConnection`                 |
| `notificationSubscription`  | `(id: String): NotificationSubscription`                                               |

### Organization

| Operation                   | Signature                                                        |
| --------------------------- | ---------------------------------------------------------------- |
| `organization`              | `(): Organization`                                               |
| `organizationExists`        | `(urlKey: String): OrganizationExistsPayload`                    |
| `organizationInvites`       | `(first: Int, after: String, ...): OrganizationInviteConnection` |
| `organizationInvite`        | `(id: String): OrganizationInvite`                               |
| `organizationInviteDetails` | `(id: String): OrganizationInviteDetailsPayload`                 |

### Integrations

| Operation                                  | Signature                                                                   |
| ------------------------------------------ | --------------------------------------------------------------------------- |
| `integrations`                             | `(first: Int, after: String, ...): IntegrationConnection`                   |
| `integration`                              | `(id: String): Integration`                                                 |
| `integrationsSettings`                     | `(id: String): IntegrationsSettings`                                        |
| `integrationTemplates`                     | `(first: Int, after: String, ...): IntegrationTemplateConnection`           |
| `integrationTemplate`                      | `(id: String): IntegrationTemplate`                                         |
| `integrationHasScopes`                     | `(integrationId: String, scopes): IntegrationHasScopesPayload`              |
| `verifyGitHubEnterpriseServerInstallation` | `(integrationId: String): GitHubEnterpriseServerInstallVerificationPayload` |

### Search & Semantic

| Operation        | Signature                                                                                                                  |
| ---------------- | -------------------------------------------------------------------------------------------------------------------------- |
| `semanticSearch` | `(query: String, types, maxResults: Int, includeArchived: Boolean, filters: SemanticSearchFilters): SemanticSearchPayload` |
| `fetchData`      | `(query: String): FetchDataPayload` — natural language, internal                                                           |

### Webhooks

| Operation  | Signature                                             |
| ---------- | ----------------------------------------------------- |
| `webhooks` | `(first: Int, after: String, ...): WebhookConnection` |
| `webhook`  | `(id: String): Webhook`                               |

### Audit & Misc

| Operation                | Signature                                                                                  |
| ------------------------ | ------------------------------------------------------------------------------------------ |
| `auditEntries`           | `(filter: AuditEntryFilter, first: Int, after: String, ...): AuditEntryConnection`         |
| `auditEntryTypes`        | `(): [AuditEntryType]`                                                                     |
| `rateLimitStatus`        | `(): RateLimitPayload`                                                                     |
| `favorites`              | `(first: Int, after: String, ...): FavoriteConnection`                                     |
| `favorite`               | `(id: String): Favorite`                                                                   |
| `customViews`            | `(filter: CustomViewFilter, sort, first: Int, after: String, ...): CustomViewConnection`   |
| `customView`             | `(id: String): CustomView`                                                                 |
| `emojis`                 | `(first: Int, after: String, ...): EmojiConnection`                                        |
| `emoji`                  | `(id: String): Emoji`                                                                      |
| `templates`              | `(): [Template]`                                                                           |
| `template`               | `(id: String): Template`                                                                   |
| `cycles`                 | see Cycles above                                                                           |
| `externalUsers`          | `(first: Int, after: String, ...): ExternalUserConnection`                                 |
| `externalUser`           | `(id: String): ExternalUser`                                                               |
| `entityExternalLink`     | `(id: String): EntityExternalLink`                                                         |
| `emailIntakeAddress`     | `(id: String): EmailIntakeAddress`                                                         |
| `triageResponsibilities` | `(first: Int, after: String, ...): TriageResponsibilityConnection`                         |
| `triageResponsibility`   | `(id: String): TriageResponsibility`                                                       |
| `timeSchedules`          | `(first: Int, after: String, ...): TimeScheduleConnection`                                 |
| `timeSchedule`           | `(id: String): TimeSchedule`                                                               |
| `availableUsers`         | `(): AuthResolverResponse`                                                                 |
| `ssoUrlFromEmail`        | `(email: String, type: IdentityProviderType, isDesktop: Boolean): SsoUrlFromEmailResponse` |

### Agent Sessions & Activities

| Operation         | Signature                                                                                |
| ----------------- | ---------------------------------------------------------------------------------------- |
| `agentSessions`   | `(first: Int, after: String, ...): AgentSessionConnection`                               |
| `agentSession`    | `(id: String): AgentSession`                                                             |
| `agentActivities` | `(filter: AgentActivityFilter, first: Int, after: String, ...): AgentActivityConnection` |
| `agentActivity`   | `(id: String): AgentActivity`                                                            |

### Releases [ALPHA]

| Operation          | Signature                                                                           |
| ------------------ | ----------------------------------------------------------------------------------- |
| `releases`         | `(filter: ReleaseFilter, sort, first: Int, ...): ReleaseConnection`                 |
| `release`          | `(id: String): Release`                                                             |
| `releaseSearch`    | `(filter: ReleaseFilter, term: String, first: Int): [releases]`                     |
| `releasePipelines` | `(filter: ReleasePipelineFilter, sort, first: Int, ...): ReleasePipelineConnection` |
| `releasePipeline`  | `(id: String): ReleasePipeline`                                                     |
| `releaseStages`    | `(filter: ReleaseStageFilter, first: Int, ...): ReleaseStageConnection`             |
| `releaseStage`     | `(id: String): ReleaseStage`                                                        |
| `issueToReleases`  | `(first: Int, after: String, ...): IssueToReleaseConnection`                        |
| `issueToRelease`   | `(id: String): IssueToRelease`                                                      |

---

## Mutations by Category

### Issues

| Mutation                   | Key Inputs                                                                                  |
| -------------------------- | ------------------------------------------------------------------------------------------- |
| `issueCreate`              | `(input: IssueCreateInput): IssuePayload`                                                   |
| `issueUpdate`              | `(id: String, input: IssueUpdateInput): IssuePayload`                                       |
| `issueBatchCreate`         | `(input: IssueBatchCreateInput): IssueBatchPayload`                                         |
| `issueBatchUpdate`         | `(ids, input: IssueUpdateInput): IssueBatchPayload`                                         |
| `issueArchive`             | `(id: String, trash: Boolean): IssueArchivePayload`                                         |
| `issueUnarchive`           | `(id: String): IssueArchivePayload`                                                         |
| `issueDelete`              | `(id: String, permanentlyDelete: Boolean): IssueArchivePayload`                             |
| `issueAddLabel`            | `(id: String, labelId: String): IssuePayload`                                               |
| `issueRemoveLabel`         | `(id: String, labelId: String): IssuePayload`                                               |
| `issueReminder`            | `(id: String, reminderAt: DateTime): IssuePayload`                                          |
| `issueSubscribe`           | `(id: String, userId: String, userEmail: String): IssuePayload`                             |
| `issueUnsubscribe`         | `(id: String, userId: String, userEmail: String): IssuePayload`                             |
| `issueRelationCreate`      | `(input: IssueRelationCreateInput): IssueRelationPayload`                                   |
| `issueRelationUpdate`      | `(id: String, input: IssueRelationUpdateInput): IssueRelationPayload`                       |
| `issueRelationDelete`      | `(id: String): DeletePayload`                                                               |
| `issueLabelCreate`         | `(input: IssueLabelCreateInput, replaceTeamLabels: Boolean): IssueLabelPayload`             |
| `issueLabelUpdate`         | `(id: String, input: IssueLabelUpdateInput, replaceTeamLabels: Boolean): IssueLabelPayload` |
| `issueLabelDelete`         | `(id: String): DeletePayload`                                                               |
| `issueLabelRetire`         | `(id: String): IssueLabelPayload`                                                           |
| `issueLabelRestore`        | `(id: String): IssueLabelPayload`                                                           |
| `issueExternalSyncDisable` | `(attachmentId: String): IssuePayload`                                                      |

### Comments

| Mutation           | Key Inputs                                                                       |
| ------------------ | -------------------------------------------------------------------------------- |
| `commentCreate`    | `(input: CommentCreateInput): CommentPayload`                                    |
| `commentUpdate`    | `(id: String, input: CommentUpdateInput, skipEditedAt: Boolean): CommentPayload` |
| `commentDelete`    | `(id: String): DeletePayload`                                                    |
| `commentResolve`   | `(id: String, resolvingCommentId: String): CommentPayload`                       |
| `commentUnresolve` | `(id: String): CommentPayload`                                                   |

### Projects

| Mutation                      | Key Inputs                                                                  |
| ----------------------------- | --------------------------------------------------------------------------- |
| `projectCreate`               | `(input: ProjectCreateInput, slackChannelName: String): ProjectPayload`     |
| `projectUpdate`               | `(id: String, input: ProjectUpdateInput): ProjectPayload`                   |
| `projectDelete`               | `(id: String): ProjectArchivePayload`                                       |
| `projectUnarchive`            | `(id: String): ProjectArchivePayload`                                       |
| `projectAddLabel`             | `(id: String, labelId: String): ProjectPayload`                             |
| `projectRemoveLabel`          | `(id: String, labelId: String): ProjectPayload`                             |
| `projectUpdateCreate`         | `(input: ProjectUpdateCreateInput): ProjectUpdatePayload`                   |
| `projectUpdateUpdate`         | `(id: String, input: ProjectUpdateUpdateInput): ProjectUpdatePayload`       |
| `projectUpdateArchive`        | `(id: String): ProjectUpdateArchivePayload`                                 |
| `projectUpdateUnarchive`      | `(id: String): ProjectUpdateArchivePayload`                                 |
| `projectStatusCreate`         | `(input: ProjectStatusCreateInput): ProjectStatusPayload`                   |
| `projectStatusUpdate`         | `(id: String, input: ProjectStatusUpdateInput): ProjectStatusPayload`       |
| `projectStatusArchive`        | `(id: String): ProjectStatusArchivePayload`                                 |
| `projectRelationCreate`       | `(input: ProjectRelationCreateInput): ProjectRelationPayload`               |
| `projectRelationUpdate`       | `(id: String, input: ProjectRelationUpdateInput): ProjectRelationPayload`   |
| `projectRelationDelete`       | `(id: String): DeletePayload`                                               |
| `projectMilestoneCreate`      | `(input: ProjectMilestoneCreateInput): ProjectMilestonePayload`             |
| `projectMilestoneUpdate`      | `(id: String, input: ProjectMilestoneUpdateInput): ProjectMilestonePayload` |
| `projectMilestoneDelete`      | `(id: String): DeletePayload`                                               |
| `projectLabelCreate`          | `(input: ProjectLabelCreateInput): ProjectLabelPayload`                     |
| `projectLabelUpdate`          | `(id: String, input: ProjectLabelUpdateInput): ProjectLabelPayload`         |
| `projectLabelDelete`          | `(id: String): DeletePayload`                                               |
| `createProjectUpdateReminder` | `(projectId: String, userId: String): ProjectUpdateReminderPayload`         |

### Teams

| Mutation               | Key Inputs                                                                             |
| ---------------------- | -------------------------------------------------------------------------------------- |
| `teamCreate`           | `(input: TeamCreateInput, copySettingsFromTeamId: String): TeamPayload`                |
| `teamUpdate`           | `(id: String, input: TeamUpdateInput, mapping: InheritanceEntityMapping): TeamPayload` |
| `teamDelete`           | `(id: String): DeletePayload`                                                          |
| `teamUnarchive`        | `(id: String): TeamArchivePayload`                                                     |
| `teamCyclesDelete`     | `(id: String): TeamPayload`                                                            |
| `teamKeyDelete`        | `(id: String): DeletePayload`                                                          |
| `teamMembershipCreate` | `(input: TeamMembershipCreateInput): TeamMembershipPayload`                            |
| `teamMembershipUpdate` | `(id: String, input: TeamMembershipUpdateInput): TeamMembershipPayload`                |
| `teamMembershipDelete` | `(id: String, alsoLeaveParentTeams: Boolean): DeletePayload`                           |

### Workflow States

| Mutation               | Key Inputs                                                            |
| ---------------------- | --------------------------------------------------------------------- |
| `workflowStateCreate`  | `(input: WorkflowStateCreateInput): WorkflowStatePayload`             |
| `workflowStateUpdate`  | `(id: String, input: WorkflowStateUpdateInput): WorkflowStatePayload` |
| `workflowStateArchive` | `(id: String): WorkflowStateArchivePayload`                           |

### Cycles

| Mutation                       | Key Inputs                                            |
| ------------------------------ | ----------------------------------------------------- |
| `cycleCreate`                  | `(input: CycleCreateInput): CyclePayload`             |
| `cycleUpdate`                  | `(id: String, input: CycleUpdateInput): CyclePayload` |
| `cycleArchive`                 | `(id: String): CycleArchivePayload`                   |
| `cycleShiftAll`                | `(input: CycleShiftAllInput): CyclePayload`           |
| `cycleStartUpcomingCycleToday` | `(id: String): CyclePayload`                          |

### Initiatives

| Mutation                         | Key Inputs                                                                        |
| -------------------------------- | --------------------------------------------------------------------------------- |
| `initiativeCreate`               | `(input: InitiativeCreateInput): InitiativePayload`                               |
| `initiativeUpdate`               | `(id: String, input: InitiativeUpdateInput): InitiativePayload`                   |
| `initiativeArchive`              | `(id: String): InitiativeArchivePayload`                                          |
| `initiativeUnarchive`            | `(id: String): InitiativeArchivePayload`                                          |
| `initiativeDelete`               | `(id: String): DeletePayload`                                                     |
| `initiativeUpdateCreate`         | `(input: InitiativeUpdateCreateInput): InitiativeUpdatePayload`                   |
| `initiativeUpdateUpdate`         | `(id: String, input: InitiativeUpdateUpdateInput): InitiativeUpdatePayload`       |
| `initiativeUpdateArchive`        | `(id: String): InitiativeUpdateArchivePayload`                                    |
| `initiativeUpdateUnarchive`      | `(id: String): InitiativeUpdateArchivePayload`                                    |
| `initiativeToProjectCreate`      | `(input: InitiativeToProjectCreateInput): InitiativeToProjectPayload`             |
| `initiativeToProjectUpdate`      | `(id: String, input: InitiativeToProjectUpdateInput): InitiativeToProjectPayload` |
| `initiativeToProjectDelete`      | `(id: String): DeletePayload`                                                     |
| `initiativeRelationCreate`       | `(input: InitiativeRelationCreateInput): InitiativeRelationPayload`               |
| `initiativeRelationUpdate`       | `(id: String, input: InitiativeRelationUpdateInput): DeletePayload`               |
| `initiativeRelationDelete`       | `(id: String): DeletePayload`                                                     |
| `createInitiativeUpdateReminder` | `(initiativeId: String, userId: String): InitiativeUpdateReminderPayload`         |

### Attachments

| Mutation                    | Key Inputs                                                                                                                   |
| --------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| `attachmentCreate`          | `(input: AttachmentCreateInput): AttachmentPayload`                                                                          |
| `attachmentUpdate`          | `(id: String, input: AttachmentUpdateInput): AttachmentPayload`                                                              |
| `attachmentDelete`          | `(id: String): DeletePayload`                                                                                                |
| `attachmentLinkURL`         | `(issueId: String, url: String, title: String, id: String, createAsUser: String, displayIconUrl: String): AttachmentPayload` |
| `attachmentLinkGitHubPR`    | `(issueId: String, url: String, title: String, id: String, linkKind: GitLinkKind, ...): AttachmentPayload`                   |
| `attachmentLinkGitHubIssue` | `(issueId: String, url: String, ...): AttachmentPayload`                                                                     |
| `attachmentLinkGitLabMR`    | `(issueId: String, url: String, projectPathWithNamespace: String, number: Float, ...): AttachmentPayload`                    |
| `attachmentLinkJiraIssue`   | `(issueId: String, jiraIssueId: String, url: String, ...): AttachmentPayload`                                                |
| `attachmentLinkZendesk`     | `(issueId: String, ticketId: String, url: String, ...): AttachmentPayload`                                                   |
| `attachmentLinkSlack`       | `(issueId: String, url: String, syncToCommentThread: Boolean, ...): AttachmentPayload`                                       |
| `attachmentLinkFront`       | `(issueId: String, conversationId: String, ...): FrontAttachmentPayload`                                                     |
| `attachmentLinkIntercom`    | `(issueId: String, conversationId: String, partId: String, ...): AttachmentPayload`                                          |
| `attachmentLinkDiscord`     | `(issueId: String, channelId: String, messageId: String, url: String, ...): AttachmentPayload`                               |
| `attachmentLinkSalesforce`  | `(issueId: String, url: String, ...): AttachmentPayload`                                                                     |
| `attachmentSyncToSlack`     | `(id: String): AttachmentPayload`                                                                                            |

### Notifications

| Mutation                         | Key Inputs                                                                                   |
| -------------------------------- | -------------------------------------------------------------------------------------------- |
| `notificationUpdate`             | `(id: String, input: NotificationUpdateInput): NotificationPayload`                          |
| `notificationMarkReadAll`        | `(input: NotificationEntityInput, readAt: DateTime): NotificationBatchActionPayload`         |
| `notificationMarkUnreadAll`      | `(input: NotificationEntityInput): NotificationBatchActionPayload`                           |
| `notificationSnoozeAll`          | `(input: NotificationEntityInput, snoozedUntilAt: DateTime): NotificationBatchActionPayload` |
| `notificationUnsnoozeAll`        | `(input: NotificationEntityInput, unsnoozedAt: DateTime): NotificationBatchActionPayload`    |
| `notificationArchive`            | `(id: String): NotificationArchivePayload`                                                   |
| `notificationArchiveAll`         | `(input: NotificationEntityInput): NotificationBatchActionPayload`                           |
| `notificationUnarchive`          | `(id: String): NotificationArchivePayload`                                                   |
| `notificationSubscriptionCreate` | `(input: NotificationSubscriptionCreateInput): NotificationSubscriptionPayload`              |
| `notificationSubscriptionUpdate` | `(id: String, input: NotificationSubscriptionUpdateInput): NotificationSubscriptionPayload`  |

### Organization

| Mutation                          | Key Inputs                                                                      |
| --------------------------------- | ------------------------------------------------------------------------------- |
| `organizationUpdate`              | `(input: OrganizationUpdateInput): OrganizationPayload`                         |
| `organizationInviteCreate`        | `(input: OrganizationInviteCreateInput): OrganizationInvitePayload`             |
| `organizationInviteUpdate`        | `(id: String, input: OrganizationInviteUpdateInput): OrganizationInvitePayload` |
| `organizationInviteDelete`        | `(id: String): DeletePayload`                                                   |
| `resendOrganizationInvite`        | `(id: String): DeletePayload`                                                   |
| `resendOrganizationInviteByEmail` | `(email: String): DeletePayload`                                                |
| `organizationDeleteChallenge`     | `(): OrganizationDeletePayload`                                                 |
| `organizationDelete`              | `(input: DeleteOrganizationInput): OrganizationDeletePayload`                   |
| `organizationCancelDelete`        | `(): OrganizationCancelDeletePayload`                                           |
| `organizationStartTrialForPlan`   | `(input: OrganizationStartTrialInput): OrganizationStartTrialPayload`           |

### Users

| Mutation                | Key Inputs                                                                          |
| ----------------------- | ----------------------------------------------------------------------------------- |
| `userUpdate`            | `(id: String, input: UserUpdateInput): UserPayload`                                 |
| `userChangeRole`        | `(id: String, role: UserRoleType): UserAdminPayload`                                |
| `userSuspend`           | `(id: String, forceBypassScimRestrictions: Boolean): UserAdminPayload`              |
| `userUnsuspend`         | `(id: String, forceBypassScimRestrictions: Boolean): UserAdminPayload`              |
| `userRevokeAllSessions` | `(id: String): UserAdminPayload`                                                    |
| `userSettingsUpdate`    | `(id: String, input: UserSettingsUpdateInput): UserSettingsPayload`                 |
| `userFlagUpdate`        | `(flag: UserFlagType, operation: UserFlagUpdateOperation): UserSettingsFlagPayload` |

### Customers

| Mutation                           | Key Inputs                                                                                          |
| ---------------------------------- | --------------------------------------------------------------------------------------------------- |
| `customerCreate`                   | `(input: CustomerCreateInput): CustomerPayload`                                                     |
| `customerUpdate`                   | `(id: String, input: CustomerUpdateInput): CustomerPayload`                                         |
| `customerDelete`                   | `(id: String): DeletePayload`                                                                       |
| `customerUpsert`                   | `(input: CustomerUpsertInput): CustomerPayload`                                                     |
| `customerMerge`                    | `(sourceCustomerId: String, targetCustomerId: String): CustomerPayload`                             |
| `customerUnsync`                   | `(id: String): CustomerPayload`                                                                     |
| `customerNeedCreate`               | `(input: CustomerNeedCreateInput): CustomerNeedPayload`                                             |
| `customerNeedCreateFromAttachment` | `(input: CustomerNeedCreateFromAttachmentInput): CustomerNeedPayload`                               |
| `customerNeedUpdate`               | `(id: String, input: CustomerNeedUpdateInput, clearAttachment: Boolean): CustomerNeedUpdatePayload` |
| `customerNeedDelete`               | `(id: String, keepAttachment: Boolean): DeletePayload`                                              |
| `customerNeedArchive`              | `(id: String): CustomerNeedArchivePayload`                                                          |
| `customerNeedUnarchive`            | `(id: String): CustomerNeedArchivePayload`                                                          |
| `customerStatusCreate`             | `(input: CustomerStatusCreateInput): CustomerStatusPayload`                                         |
| `customerStatusUpdate`             | `(id: String, input: CustomerStatusUpdateInput): CustomerStatusPayload`                             |
| `customerStatusDelete`             | `(id: String): DeletePayload`                                                                       |
| `customerTierCreate`               | `(input: CustomerTierCreateInput): CustomerTierPayload`                                             |
| `customerTierUpdate`               | `(id: String, input: CustomerTierUpdateInput): CustomerTierPayload`                                 |
| `customerTierDelete`               | `(id: String): DeletePayload`                                                                       |

### Documents

| Mutation            | Key Inputs                                                  |
| ------------------- | ----------------------------------------------------------- |
| `documentCreate`    | `(input: DocumentCreateInput): DocumentPayload`             |
| `documentUpdate`    | `(id: String, input: DocumentUpdateInput): DocumentPayload` |
| `documentDelete`    | `(id: String): DocumentArchivePayload`                      |
| `documentUnarchive` | `(id: String): DocumentArchivePayload`                      |

### Webhooks

| Mutation              | Key Inputs                                                |
| --------------------- | --------------------------------------------------------- |
| `webhookCreate`       | `(input: WebhookCreateInput): WebhookPayload`             |
| `webhookUpdate`       | `(id: String, input: WebhookUpdateInput): WebhookPayload` |
| `webhookDelete`       | `(id: String): DeletePayload`                             |
| `webhookRotateSecret` | `(id: String): WebhookRotateSecretPayload`                |

### Favorites & Custom Views

| Mutation           | Key Inputs                                                      |
| ------------------ | --------------------------------------------------------------- |
| `favoriteCreate`   | `(input: FavoriteCreateInput): FavoritePayload`                 |
| `favoriteUpdate`   | `(id: String, input: FavoriteUpdateInput): FavoritePayload`     |
| `favoriteDelete`   | `(id: String): DeletePayload`                                   |
| `customViewCreate` | `(input: CustomViewCreateInput): CustomViewPayload`             |
| `customViewUpdate` | `(id: String, input: CustomViewUpdateInput): CustomViewPayload` |
| `customViewDelete` | `(id: String): DeletePayload`                                   |

### Reactions & Emojis

| Mutation         | Key Inputs                                      |
| ---------------- | ----------------------------------------------- |
| `reactionCreate` | `(input: ReactionCreateInput): ReactionPayload` |
| `reactionDelete` | `(id: String): DeletePayload`                   |
| `emojiCreate`    | `(input: EmojiCreateInput): EmojiPayload`       |
| `emojiDelete`    | `(id: String): DeletePayload`                   |

### Integrations (selection)

| Mutation                                   | Key Inputs                                                                                                  |
| ------------------------------------------ | ----------------------------------------------------------------------------------------------------------- |
| `integrationGithubConnect`                 | `(code: String, installationId: String, githubHost: String, codeAccess: Boolean): IntegrationPayload`       |
| `integrationSlack`                         | `(code: String, redirectUri: String, shouldUseV2Auth: Boolean): IntegrationPayload`                         |
| `integrationSlackPersonal`                 | `(code: String, redirectUri: String): IntegrationPayload`                                                   |
| `integrationSlackPost`                     | `(teamId: String, code: String, redirectUri: String, shouldUseV2Auth: Boolean): SlackChannelConnectPayload` |
| `integrationSlackProjectPost`              | `(projectId: String, code: String, redirectUri: String, service: String): SlackChannelConnectPayload`       |
| `integrationGitlabConnect`                 | `(accessToken: String, gitlabUrl: String): GitLabIntegrationCreatePayload`                                  |
| `integrationGoogleCalendarPersonalConnect` | `(code: String): IntegrationPayload`                                                                        |
| `integrationDelete`                        | `(id: String, skipInstallationDeletion: Boolean): DeletePayload`                                            |
| `integrationRequest`                       | `(input: IntegrationRequestInput): IntegrationRequestPayload`                                               |

### Git Automation

| Mutation                          | Key Inputs                                                                                    |
| --------------------------------- | --------------------------------------------------------------------------------------------- |
| `gitAutomationStateCreate`        | `(input: GitAutomationStateCreateInput): GitAutomationStatePayload`                           |
| `gitAutomationStateUpdate`        | `(id: String, input: GitAutomationStateUpdateInput): GitAutomationStatePayload`               |
| `gitAutomationStateDelete`        | `(id: String): DeletePayload`                                                                 |
| `gitAutomationTargetBranchCreate` | `(input: GitAutomationTargetBranchCreateInput): GitAutomationTargetBranchPayload`             |
| `gitAutomationTargetBranchUpdate` | `(id: String, input: GitAutomationTargetBranchUpdateInput): GitAutomationTargetBranchPayload` |
| `gitAutomationTargetBranchDelete` | `(id: String): DeletePayload`                                                                 |

### Issue Imports

| Mutation                     | Key Inputs                                                                                                        |
| ---------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| `issueImportCreateGithub`    | `(teamId: String, githubRepoIds, includeClosedIssues: Boolean, instantProcess: Boolean, ...): IssueImportPayload` |
| `issueImportCreateJira`      | `(teamId: String, jiraHostname, jiraToken, jiraEmail, jiraProject, jql, ...): IssueImportPayload`                 |
| `issueImportCreateCSVJira`   | `(teamId: String, csvUrl: String, jiraHostname, jiraToken, jiraEmail): IssueImportPayload`                        |
| `issueImportCreateClubhouse` | `(teamId: String, clubhouseToken: String, ...): IssueImportPayload`                                               |
| `issueImportCreateAsana`     | `(teamId: String, asanaToken: String, asanaTeamName: String, ...): IssueImportPayload`                            |
| `issueImportProcess`         | `(issueImportId: String, mapping: JSONObject): IssueImportPayload`                                                |
| `issueImportUpdate`          | `(id: String, input: IssueImportUpdateInput): IssueImportPayload`                                                 |
| `issueImportDelete`          | `(issueImportId: String): IssueImportDeletePayload`                                                               |

### File Uploads

| Mutation             | Key Inputs                                                                                               |
| -------------------- | -------------------------------------------------------------------------------------------------------- |
| `fileUpload`         | `(filename: String, contentType: String, size: Int, makePublic: Boolean, metaData: JSON): UploadPayload` |
| `importFileUpload`   | `(filename: String, contentType: String, size: Int, metaData: JSON): UploadPayload`                      |
| `imageUploadFromUrl` | `(url: String): ImageUploadFromUrlPayload`                                                               |

### Agent Sessions

| Mutation                      | Key Inputs                                                          |
| ----------------------------- | ------------------------------------------------------------------- |
| `agentSessionCreateOnIssue`   | `(input: AgentSessionCreateOnIssue): AgentSessionPayload`           |
| `agentSessionCreateOnComment` | `(input: AgentSessionCreateOnComment): AgentSessionPayload`         |
| `agentSessionUpdate`          | `(id: String, input: AgentSessionUpdateInput): AgentSessionPayload` |
| `agentActivityCreate`         | `(input: AgentActivityCreateInput): AgentActivityPayload`           |

### Releases [ALPHA]

| Mutation                | Key Inputs                                                                |
| ----------------------- | ------------------------------------------------------------------------- |
| `releaseCreate`         | `(input: ReleaseCreateInput): ReleasePayload`                             |
| `releaseUpdate`         | `(id: String, input: ReleaseUpdateInput): ReleasePayload`                 |
| `releaseComplete`       | `(input: ReleaseCompleteInput): ReleasePayload`                           |
| `releaseDelete`         | `(id: String): ReleaseArchivePayload`                                     |
| `releasePipelineCreate` | `(input: ReleasePipelineCreateInput): ReleasePipelinePayload`             |
| `releasePipelineUpdate` | `(id: String, input: ReleasePipelineUpdateInput): ReleasePipelinePayload` |
| `releasePipelineDelete` | `(id: String): DeletePayload`                                             |
| `releaseStageCreate`    | `(input: ReleaseStageCreateInput): ReleaseStagePayload`                   |
| `releaseStageUpdate`    | `(id: String, input: ReleaseStageUpdateInput): ReleaseStagePayload`       |
| `issueToReleaseCreate`  | `(input: IssueToReleaseCreateInput): IssueToReleasePayload`               |
| `issueToReleaseDelete`  | `(id: String): DeletePayload`                                             |

### Triage & Time Schedules

| Mutation                     | Key Inputs                                                                          |
| ---------------------------- | ----------------------------------------------------------------------------------- |
| `triageResponsibilityCreate` | `(input: TriageResponsibilityCreateInput): TriageResponsibilityPayload`             |
| `triageResponsibilityUpdate` | `(id: String, input: TriageResponsibilityUpdateInput): TriageResponsibilityPayload` |
| `triageResponsibilityDelete` | `(id: String): DeletePayload`                                                       |
| `timeScheduleCreate`         | `(input: TimeScheduleCreateInput): TimeSchedulePayload`                             |
| `timeScheduleUpdate`         | `(id: String, input: TimeScheduleUpdateInput): TimeSchedulePayload`                 |
| `timeScheduleDelete`         | `(id: String): DeletePayload`                                                       |
| `timeScheduleUpsertExternal` | `(externalId: String, input: TimeScheduleUpdateInput): TimeSchedulePayload`         |

### Misc

| Mutation                   | Key Inputs                                                                      |
| -------------------------- | ------------------------------------------------------------------------------- |
| `entityExternalLinkCreate` | `(input: EntityExternalLinkCreateInput): EntityExternalLinkPayload`             |
| `entityExternalLinkUpdate` | `(id: String, input: EntityExternalLinkUpdateInput): EntityExternalLinkPayload` |
| `entityExternalLinkDelete` | `(id: String): DeletePayload`                                                   |
| `emailIntakeAddressCreate` | `(input: EmailIntakeAddressCreateInput): EmailIntakeAddressPayload`             |
| `emailIntakeAddressRotate` | `(id: String): EmailIntakeAddressPayload`                                       |
| `emailIntakeAddressDelete` | `(id: String): DeletePayload`                                                   |
| `templateCreate`           | `(input: TemplateCreateInput): TemplatePayload`                                 |
| `templateUpdate`           | `(id: String, input: TemplateUpdateInput): TemplatePayload`                     |
| `templateDelete`           | `(id: String): DeletePayload`                                                   |
| `roadmapToProjectCreate`   | `(input: RoadmapToProjectCreateInput): RoadmapToProjectPayload`                 |
| `roadmapToProjectUpdate`   | `(id: String, input: RoadmapToProjectUpdateInput): RoadmapToProjectPayload`     |
| `roadmapToProjectDelete`   | `(id: String): DeletePayload`                                                   |
| `createCsvExportReport`    | `(includePrivateTeamIds): CreateCsvExportReportPayload`                         |
| `contactCreate`            | `(input: ContactCreateInput): ContactPayload`                                   |

---

## Key Input Types

### `IssueCreateInput`

```
teamId: String!          # required
title: String
description: String      # markdown
assigneeId: String
stateId: String
priority: Int            # 0=none,1=urgent,2=high,3=medium,4=low
estimate: Int
labelIds: [String]
projectId: String
projectMilestoneId: String
cycleId: String
parentId: String
dueDate: TimelessDate    # "YYYY-MM-DD"
subscriberIds: [String]
sortOrder: Float
subIssueSortOrder: Float
createAsUser: String     # display name override (bot use)
displayIconUrl: String   # avatar override (bot use)
createdAt: DateTime
templateId: String
```

### `IssueUpdateInput`

```
title: String
description: String
assigneeId: String       # null to unassign
stateId: String
priority: Int
estimate: Int
labelIds: [String]       # replaces all labels
addedLabelIds: [String]  # additive
removedLabelIds: [String]
projectId: String        # null to remove from project
projectMilestoneId: String
cycleId: String          # null to remove from cycle
parentId: String         # null to unparent
teamId: String           # move to different team
dueDate: TimelessDate
trashed: Boolean
snoozedUntilAt: DateTime
```

### `ProjectCreateInput`

```
name: String!
teamIds: [String]!
description: String
statusId: String
leadId: String
memberIds: [String]
targetDate: TimelessDate
startDate: TimelessDate
priority: Int
color: String
icon: String
content: String          # markdown body
labelIds: [String]
templateId: String
```

### `ProjectUpdateInput`

```
name: String
description: String
content: String
statusId: String
leadId: String
memberIds: [String]
teamIds: [String]
targetDate: TimelessDate
startDate: TimelessDate
priority: Int
color: String
icon: String
labelIds: [String]
trashed: Boolean
completedAt: DateTime
canceledAt: DateTime
```

### `DocumentCreateInput`

```
title: String            # document title
content: String          # markdown body
projectId: String        # attach to a project
issueId: String          # attach to an issue (UUID or identifier e.g. "ENG-42")
initiativeId: String     # attach to an initiative
icon: String             # emoji icon
color: String            # icon color
sortOrder: Float
```

### `DocumentUpdateInput`

```
title: String
content: String          # markdown, replaces entire body
projectId: String        # move to a different project
issueId: String
initiativeId: String
icon: String
color: String
trashed: Boolean
sortOrder: Float
```

### `CommentCreateInput`

```
body: String             # markdown
issueId: String          # target issue (or use projectUpdateId / projectId / initiativeId)
projectUpdateId: String
projectId: String
initiativeId: String
parentId: String         # for threaded replies
createAsUser: String
displayIconUrl: String
quotedText: String
subscriberIds: [String]
doNotSubscribeToIssue: Boolean
```

### `IssueRelationCreateInput`

```
issueId: String!
relatedIssueId: String!
type: IssueRelationType! # "blocks","blocked_by","duplicate_of","duplicates","related"
```

### `ProjectMilestoneCreateInput`

```
projectId: String!
name: String!
targetDate: TimelessDate
description: String
sortOrder: Float
```

---

## Key Return Type Fields

### `Issue` (most useful)

```graphql
id identifier title description
priority priorityLabel estimate
state { id name type color }
team { id name key }
assignee { id name displayName email }
creator { id name displayName }
labels { nodes { id name color } }
project { id name }
projectMilestone { id name }
cycle { id number name }
parent { id identifier title }
children { nodes { id identifier title state { name } } }
comments { nodes { id body user { name } createdAt } }
attachments { nodes { id title url source } }
dueDate createdAt updatedAt completedAt canceledAt
url branchName trashed
relations { nodes { type relatedIssue { id identifier title } } }
```

### `Project` (most useful)

```graphql
id name description slugId url
status { id name type color }
lead { id name displayName }
members { nodes { id name displayName } }
teams { nodes { id name key } }
priority priorityLabel
startDate targetDate completedAt canceledAt
progress scope
issues { nodes { id identifier title state { name } priority } }
projectMilestones { nodes { id name targetDate } }
projectUpdates { nodes { id body health createdAt } }
labels { nodes { id name color } }
initiatives { nodes { id name } }
content createdAt updatedAt trashed
```

### `Team` (most useful)

```graphql
id name key description color icon
organization { id name }
states { nodes { id name type color position } }
labels { nodes { id name color } }
members { nodes { id name displayName email } }
activeCycle { id number startsAt endsAt }
cycles { nodes { id number startsAt endsAt isActive } }
issueCount
triageEnabled cyclesEnabled timezone
private
```

### `WorkflowState` (most useful)

```graphql
id name type color description position
team { id name }
```

`type` values: `"triage"` `"backlog"` `"unstarted"` `"started"` `"completed"` `"cancelled"`

### `User` (most useful)

```graphql
id name displayName email avatarUrl
active guest admin owner
teams { nodes { id name key } }
assignedIssues { nodes { id identifier title state { name } priority } }
timezone statusLabel statusEmoji
```

### `Cycle` (most useful)

```graphql
id number name description
startsAt endsAt completedAt
isActive isFuture isPast isNext isPrevious
team { id name }
issues { nodes { id identifier title state { name } } }
progress
```

### `Comment` (most useful)

```graphql
id body bodyData
user { id name displayName }
issue { id identifier title }
parent { id body }
children { nodes { id body user { name } } }
resolvedAt resolvingUser { id name }
createdAt updatedAt editedAt
url reactionData
```

### `Document` (most useful)

```graphql
id title url
content           # markdown body
project { id name }
issue { id identifier title }
initiative { id name }
creator { id name displayName }
updatedBy { id name displayName }
createdAt updatedAt archivedAt trashed
```

### `IssueRelation` (most useful)

```graphql
id type
issue { id identifier title state { name } }
relatedIssue { id identifier title state { name } }
createdAt
```

### `Connection` types (pagination)

All `*Connection` types expose:

```graphql
nodes { ...fields }
pageInfo { hasNextPage hasPreviousPage startCursor endCursor }
```

---

## Common Patterns & Gotchas

### 1. Always get viewer/team IDs first

```javascript
// Get your own ID and team IDs before creating issues
linear(`query { viewer { id } }`);
linear(`query { teams { nodes { id name key } } }`);
```

### 2. Creating an issue (minimum viable)

```javascript
linear(
  `mutation Create($input: IssueCreateInput!) { issueCreate(input: $input) { issue { id identifier url } } }`,
  { input: { teamId: "TEAM_ID", title: "Bug: login broken" } },
);
```

### 3. Filtering issues

```javascript
// Filter supports nested AND/OR/comparators
linear(
  `query($filter: IssueFilter!) { issues(filter: $filter) { nodes { id identifier title state { name } } } }`,
  {
    filter: {
      team: { key: { eq: "ENG" } },
      state: { type: { eq: "started" } },
      assignee: { id: { eq: "USER_ID" } },
    },
  },
);
```

### 4. Pagination — always use `first` + `after`

```javascript
// First page
linear(`query { issues(first: 50) { nodes { id } pageInfo { hasNextPage endCursor } } }`);
// Next page
linear(
  `query($after: String) { issues(first: 50, after: $after) { nodes { id } pageInfo { hasNextPage endCursor } } }`,
  { after: "CURSOR" },
);
```

### 5. Moving an issue to a new state

```javascript
// Get state IDs from team first: team.states.nodes
linear(
  `mutation($id: String!, $input: IssueUpdateInput!) { issueUpdate(id: $id, input: $input) { issue { id state { name } } } }`,
  { id: "ISSUE_ID", input: { stateId: "STATE_ID" } },
);
```

### 6. `identifier` vs `id`

- `identifier` is the human-readable key like `"ENG-123"` — use for display only
- `id` is the UUID — use for all API calls

### 7. Priority values

`0` = No priority · `1` = Urgent · `2` = High · `3` = Medium · `4` = Low

### 8. Null to clear optional fields

Set `assigneeId: null`, `projectId: null`, `parentId: null`, etc. in `IssueUpdateInput` to explicitly clear them.

### 9. Use `searchIssues` (not deprecated `issueSearch`) for text search

```javascript
linear(
  `query($term: String!) { searchIssues(term: $term, first: 25) { nodes { id identifier title } } }`,
  { term: "login error" },
);
```

### 10. `dueDate` / `startDate` / `targetDate` format

Use `TimelessDate` = `"YYYY-MM-DD"` string (no time component). `DateTime` fields use ISO-8601 with timezone.

### 11. Rate limits

Check `rateLimitStatus { requestsRemaining limit resetsAt }` if hitting limits. The API returns HTTP 429 when exceeded.

### 12. Archived vs trashed

- **Archived**: soft-removed, retrievable with `includeArchived: true`
- **Trashed** (`issueDelete`/`projectDelete`): moved to trash, permanently deleted after 30 days. Use `issueArchive` to archive, `issueDelete` to trash.

### 13. Creating a document on a project

Documents are first-class content attached to projects, issues, or initiatives.

```javascript
// Step 1 – get the project ID
linear(`query { projects(first: 20) { nodes { id name } } }`);

// Step 2 – create the document
linear(
  `mutation CreateDoc($input: DocumentCreateInput!) {
     documentCreate(input: $input) {
       success
       document { id title url }
     }
   }`,
  {
    input: {
      title: "Architecture Overview",
      content: "# Architecture\n\nDescribe the design here.",
      projectId: "PROJECT_UUID",
    },
  },
);
```

```javascript
// Update an existing document's content
linear(
  `mutation UpdateDoc($id: String!, $input: DocumentUpdateInput!) {
     documentUpdate(id: $id, input: $input) {
       success
       document { id title updatedAt }
     }
   }`,
  { id: "DOC_UUID", input: { content: "# Updated content\n\nNew text here." } },
);
```

```javascript
// List documents for a project
linear(
  `query($filter: DocumentFilter) {
     documents(filter: $filter, first: 50) {
       nodes { id title url updatedAt project { id name } }
     }
   }`,
  { filter: { project: { id: { eq: "PROJECT_UUID" } } } },
);
```
