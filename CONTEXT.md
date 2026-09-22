# My Pet Care

My Pet Care is a platform for tracking pet health and connecting pet owners through thematic communities. This repository implements the platform's backend.

## Language

**Pet**:
The animal whose health is tracked and whose exercise is managed on the platform. Each Pet is managed by exactly one Owner.
_Avoid_: Animal, companion

**Owner**:
The person who manages one or more pets and participates in communities.
_Avoid_: User, caregiver, account holder

**Pet list visibility**:
An Owner-level setting that controls whether other Owners may see that Owner’s list of Pets. Defaults to private; the Owner may set it to public. Does not expose Pet details.
_Avoid_: Profile visibility, pet privacy

**Health profile**:
The latest health-oriented values for a Pet (for example current weight and recommended daily kilocalories), distinct from the Pet’s identity fields owned elsewhere. A new weight reading sets the profile’s latest weight and appends a weight Health metric for history.
_Avoid_: Health data, health record, pet profile

**Health metric**:
A historical reading of a measurable health dimension for a Pet at a point in time. The tracked dimensions are calories consumed, weight, and exercise amount.
_Avoid_: Health data point, vital

**Meal**:
A feeding the Owner logs for a Pet: food name, kilocalories contributed, and when it was fed. Brand, free-text labels, and notes may be included. Meals are the write path for the calories-consumed Health metric.
_Avoid_: Feeding log, food entry, calorie log

**Wash**:
A completed hygiene event for a Pet (for example a bath) logged at a point in time.
_Avoid_: Bath, grooming session, hygiene event

**Wash schedule**:
A recurring interval set by the Owner that determines when a Pet’s next Wash is due, from the last Wash plus the interval.
_Avoid_: Wash appointment, hygiene plan, grooming schedule

**Medical record**:
The Pet’s clinical history as presented to the Owner: its Vet visits and Medications together. Not a separately authored document.
_Avoid_: Health record, chart, clinical file

**Vet visit**:
A recorded veterinary encounter for a Pet, including when it happened, the clinic name, and a reason or summary.
_Avoid_: Appointment, consultation, clinic visit

**Medication**:
A treatment course for a Pet (drug name, dosage instructions, start and optional end), optionally linked to a Vet visit. Not an individual dose administration.
_Avoid_: Prescription, drug, treatment, dose log

**Exercise**:
A type of physical activity a pet can perform, such as a walk, run, or play session.
_Avoid_: Workout, activity

**Activity**:
A logged record that a pet performed exercise at a point in time.
_Avoid_: Exercise log, workout, session

**Community**:
A thematic social space where owners interact around a shared interest or locale.
_Avoid_: Group, channel

**Forum**:
A discussion area within a community where owners share opinions and ask questions.
_Avoid_: Board, thread

**Shared location**:
A place an owner recommends within a community for pet-related activities.
_Avoid_: Venue, spot, POI

**Group activity**:
A planned event within a community where multiple owners and their pets participate together.
_Avoid_: Meetup, event
