# Shared App Backlog — Specification

## 1. Purpose

A small private web app to manage the backlog of several personal applications.

It is intended for personal use, family, and close friends. The product must remain fast, simple, and easy to maintain.

## 2. Core Features

Users can:

- view the backlog of each application;
- create bug reports, feature requests, improvements, and tasks;
- vote on existing cards;
- add subtasks;
- view card status and progress.

The administrator can also manage internal cards and control the workflow.

## 3. Roles and Permissions

### Administrator

The administrator can:

- create, edit, and delete any card;
- move cards between statuses;
- view shared and internal cards;
- manage all subtasks;
- change card visibility.

### Card Owner

The card owner is the user who created the card.

The owner can:

- edit and delete their own card;
- create, edit, complete, reorder, and delete its subtasks;
- vote on other cards.

The owner cannot:

- move cards between statuses;
- edit cards created by other users;
- view internal cards.

### Other Users

Other users can:

- view shared cards;
- create cards;
- vote and remove their vote;
- view card details and subtasks.

## 4. Applications

The home screen displays all available applications.

Each application contains:

- name;
- icon;
- optional description;
- number of active cards.

Selecting an application opens its backlog.

## 5. Workflow

Cards use the following statuses:

1. `Backlog`
2. `In Progress`
3. `In Review`
4. `Done`
5. `Discarded`

Only the administrator can change a card's status.

`Discarded` cards may appear in a separate view or filter.

## 6. Cards

Each card contains:

- title;
- optional description;
- application;
- type;
- status;
- creator;
- visibility;
- creation date;
- update date;
- votes;
- subtasks.

### Card Types

- `Bug`
- `Feature`
- `Improvement`
- `Task`

### Visibility

- `Shared`: visible to all users.
- `Internal`: visible only to the administrator.

Cards created by the administrator must be visually distinguishable from cards created by other users.

## 7. Creating a Card

The creation form contains:

- application;
- title;
- type;
- optional description.

The administrator can also select visibility.

Default behavior:

- cards created by other users are shared;
- new cards start in `Backlog`.

## 8. Voting

Each user can vote once per card and remove their vote later.

The card displays its total number of votes.

While a user enters a title, the app should show similar existing cards to reduce duplicates.

The user can open an existing card and vote instead of creating a new one.

## 9. Subtasks

Each card can contain a simple checklist.

Each subtask contains:

- title;
- completed state;
- manual order.

Subtasks do not have assignees, priorities, deadlines, or independent statuses.

Card summaries display progress, for example: `2 / 4 subtasks`.

## 10. Screens

### Applications

Displays all applications.

### Application Backlog

Displays cards grouped by status.

On mobile, statuses may be shown as tabs instead of simultaneous columns.

### Card Details

Displays:

- full card information;
- votes;
- subtasks;
- creator;
- status;
- actions allowed by the current user's permissions.

### Create or Edit Card

Simple form for card creation and editing.

### Discarded

Separate view or filter for discarded cards.

## 11. Card Summary

A backlog card displays only:

- title;
- type;
- creator;
- vote count;
- subtask progress;
- internal or administrator-created indicator, when relevant.

The full description is shown only in card details.

## 12. Filters

Minimum filters:

- all;
- created by me;
- requests from others;
- internal;
- bug;
- feature;
- improvement;
- task.

Advanced search and filtering are not required for the first version.

## 13. Data Model

### App

- `id`
- `name`
- `icon`
- `description`

### User

- `id`
- `name`
- `role`

### BacklogItem

- `id`
- `appId`
- `creatorId`
- `title`
- `description`
- `type`
- `status`
- `visibility`
- `createdAt`
- `updatedAt`

### Vote

- `itemId`
- `userId`

### Subtask

- `id`
- `itemId`
- `title`
- `completed`
- `position`

## 14. Out of Scope

The first version will not include:

- story points;
- estimates;
- sprints;
- complex priorities;
- dependencies;
- assignments;
- comments;
- advanced notifications;
- full user profiles;
- deadlines;
- public roadmaps;
- detailed audit history.

## 15. Product Principles

- Creating a card must take only a few seconds.
- The interface must show only essential information.
- Permissions must be easy to understand.
- Only the administrator controls workflow status.
- Voting should reduce duplicate requests.
- Subtasks should remain a simple checklist.
- The app must not become a complex project management tool.
