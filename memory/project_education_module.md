---
name: Education & Formation Module
description: Comprehensive management system for schools and training centers.
type: project
---

# Education & Formation Module

Added a full-featured module for educational institutions, allowing them to manage their core operations within ELM.

## Features
- **Student Management**: Profiles, parent contact info, enrollment status.
- **Classroom Organization**: Levels, capacity, and teacher assignment.
- **Tuition Tracking**: Integration with the orders system to track school fees.
- **Academic Performance**: Recording grades by subject and term.

## Technical Details
- **Migration**: `079_education_module.sql`
- **Business Type**: `education`
- **New Tables**: `edu_classrooms`, `edu_students`, `edu_grades`
- **Service**: `services/supabase/education.ts`
- **Navigation**: New "Scolarité" section in the sidebar.

## Usage
Users can select the "Éducation / École" sector during onboarding to have these features pre-activated.
Existing businesses of type `education` will automatically see these modules.
