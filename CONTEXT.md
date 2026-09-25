# My Pet Care

My Pet Care is a platform for tracking pet health and connecting pet owners through thematic communities. This repository implements the platform's backend.

## Language

### Identity

**Pet**:
The animal whose health is tracked and whose Activities are managed on the platform. Each Pet is managed by exactly one Owner.
_Avoid_: Animal, companion

**Owner**:
The person who manages one or more Pets and participates in communities.
_Avoid_: User, caregiver, account holder

**Deactivation**:
Marking an Owner or Pet inactive while retaining the record. It is not a hard delete. Deactivating an Owner first deactivates that Owner’s active Pets, then deactivates the Owner. An Owner who is still Community owner of any Community cannot be deactivated until each Community ownership transfer is complete. Deactivating an Owner ends their belonging in every Community and their Community administrator role in each.
_Avoid_: Suspension, archive, delete

**Hard delete**:
Permanently removing a record so it is no longer retrievable. Used for entities such as Meals and Activities; not used for Owner or Pet identity, which use Deactivation instead.
_Avoid_: Delete, purge, remove

**Pet list visibility**:
An Owner-level setting that controls whether other Owners may see that Owner’s list of Pets. Defaults to private; the Owner may set it to public. Does not expose Pet details.
_Avoid_: Profile visibility, pet privacy

### Health

**Health profile**:
The latest health-oriented values for a Pet: latest weight and recommended daily kilocalories, distinct from the Pet’s identity fields owned elsewhere. A new weight reading sets the profile’s latest weight and appends a weight Health metric for history.
_Avoid_: Health data, health record, pet profile

**Recommended daily kilocalories**:
The daily energy target for a Pet on its Health profile, either computed from weight and species or set by an Owner override until recalculated. It is not Calories burned or the calories-consumed Health metric.
_Avoid_: Daily kcal, RER target, calorie budget

**Health metric**:
A historical reading of a measurable health dimension for a Pet at a point in time. The tracked dimensions are calories consumed, weight, and activity duration.
_Avoid_: Health data point, vital

**Register**:
The Owner’s act of recording a Meal, a Wash, or an Activity for a Pet.
_Avoid_: Log

**Meal**:
A feeding the Owner registers for a Pet: food name, kilocalories contributed, and when it was fed. Brand, free-text labels, and notes may be included. Meals are the write path for the calories-consumed Health metric.
_Avoid_: Feeding log, food entry, calorie log

**Wash**:
A completed hygiene event for a Pet (for example a bath), registered at a point in time.
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

### Activity

**Activity type**:
A kind of physical activity a Pet can perform, such as a walk, run, or play session. Each Activity type is either platform-default or custom.
_Avoid_: Exercise, workout

**Platform-default Activity type**:
An Activity type supplied with the platform. It is global and not editable or deletable by Owners.
_Avoid_: System exercise, built-in type

**Custom Activity type**:
An Activity type an Owner creates for their own Pets. It may be renamed, deleted, or soft-retired under Activity Manager rules.
_Avoid_: User-defined exercise, personal workout type

**Soft-retired Activity type**:
A custom Activity type hidden from the pickable catalog because historical Activities still reference it. Existing Activities and Shares still resolve it.
_Avoid_: Archived type, disabled exercise

**Activity**:
A record the Owner registers that a Pet performed an Activity type at a point in time. Activities are the write path for the activity-duration Health metric.
_Avoid_: Exercise log, workout, session, log

**GPS Activity**:
An Activity that includes a completed route because its Activity type is GPS-capable. The route does not change Calories burned or the activity-duration Health metric.
_Avoid_: Track, live workout, GPS session

**Activity amount**:
The optional type-dependent quantity on an Activity, such as a distance or a count. It is not the activity-duration Health metric.
_Avoid_: Exercise amount, measure

**Calories burned**:
The kilocalories attributed to one Activity, either system-estimated or set by an Owner override. It is not the calories-consumed Health metric.
_Avoid_: Calories consumed, energy expenditure, calorie log

**Share**:
An Owner’s grant that one audience may read a single Activity. The audience is another Owner, a Forum, a Group activity, or anyone holding an external link. Revoking one Share leaves any other Share of that Activity in place.
_Avoid_: Post, broadcast, export

**Share snapshot**:
The fixed Activity summary a Share exposes when resolved, including Pet display name, Activity type, timing, Calories burned, and optional Activity amount, notes, media, or route. It is not edited separately from the Activity.
_Avoid_: Share payload, preview, card

### Communities

**Community**:
A thematic social space, either open or closed, that an Owner creates and then participates in with other Owners. An Owner with belonging may read a Share addressed to its Forums or Group activities, recommend Shared locations, and end their own belonging; the Community itself is not a Share audience.
_Avoid_: Group, channel, feed

**Open Community**:
A Community any Owner may join. Joining creates belonging immediately.
_Avoid_: Public community

**Closed Community**:
A Community an Owner may join only after a Community administrator approves their join request. Until then, that Owner has no belonging there.
_Avoid_: Private community

**Join request**:
An Owner’s request for belonging in a Closed Community before they belong. A Community administrator approves or rejects it; the Owner may withdraw it. Approval creates belonging.
_Avoid_: Membership application, access request

**Belonging**:
An Owner’s relationship to a Community once they have joined an Open Community or been approved for a Closed Community.
_Avoid_: Membership, member status

**Community administrator**:
An Owner who may manage a Community: approve joins to a Closed Community, and end another Owner’s belonging. Ending an Owner’s belonging, whether by a Community administrator or by that Owner, also ends their Community administrator role. The Community owner may end another Owner’s Community administrator role without ending their belonging.
_Avoid_: Moderator, manager

**Community owner**:
The Owner who created a Community and chose whether it is open or closed, or who received the Community through a Community ownership transfer. They are a Community administrator, the only one who may grant or end that role in another Owner or transfer Community ownership. Their belonging cannot be ended by leaving or by another Community administrator while they hold that role.
_Avoid_: Owner, founder, creator

**Community ownership transfer**:
The Community owner assigns Community ownership to another Owner with belonging in that Community. The recipient becomes Community owner and gains the full Community administrator role, including the exclusive powers to grant or end Community administrator and to transfer ownership. The previous Community owner keeps their Community administrator role unless the new Community owner ends it. An Owner cannot be deactivated while they remain Community owner of any Community.
_Avoid_: Handover, succession

**Forum**:
A discussion area within a Community where Owners share opinions and ask questions. Only a Community administrator may create a Forum. A Forum may be the audience of a Share.
_Avoid_: Board, thread, post

**Shared location**:
A place an Owner with belonging in a Community recommends for pet-related activities there. It is not a Share audience.
_Avoid_: Venue, spot, POI

**Group activity**:
A planned event within a Community where multiple Owners and their Pets participate together. Only a Community administrator may create a Group activity. A Group activity may be the audience of a Share.
_Avoid_: Meetup, event

### Backend services

**Owner & Pet Manager**:
The backend service that owns Owner and Pet identity, the Owner–Pet relationship, Deactivation, and Pet list visibility.
_Avoid_: OPM, user service, account service

**Pet Health Service**:
The backend service that owns the Health profile, Health metrics, Meals, Washes, Wash schedules, Vet visits, Medications, and the Medical record view for a Pet.
_Avoid_: PHS, health module

**Activity Manager**:
The backend service that owns Activity types, Activities, and Shares. It syncs activity-duration Health metrics to Pet Health Service.
_Avoid_: AM, exercise service

**Authentication Service**:
The backend service that establishes an Owner is who they claim to be and replaces a forgotten password. Owner and Pet identity stay with Owner & Pet Manager.
_Avoid_: identity provider, login service, account service

Community terms in this glossary are platform-wide; a backend service for Communities is not yet scoped in requirements.
