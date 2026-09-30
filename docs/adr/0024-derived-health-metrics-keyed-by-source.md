---
status: accepted
---

# Derived Health metrics are keyed by their source

Pet Health Service identifies a calories-consumed Health metric by its Meal's id, and an activity-duration Health metric by its Activity's id in Activity Manager. Each Meal and each Activity has exactly one such metric, so the source id already identifies the metric. Activity Manager writes the activity-duration metric with `PUT /activity-duration-metrics/{activityId}`, which creates it (`201`) or corrects it (`200`), and removes it with `DELETE` on the same path. The Owner reads it on that path too.

Activity Manager fails closed when this sync cannot be completed (AM-NFR-005). With the Activity id as the key, Activity Manager can retry a sync after a timeout without creating a second metric, and it stores no Pet Health id of its own. Weight metrics have no source and keep their own ids.

**Considered options.** Separate metric ids with `POST` to create and `PATCH`/`DELETE` by metric id: Activity Manager would have to store the returned id, and a create retried after a lost response would create a duplicate. Separate metric ids with an Activity-id lookup route: two ways to address one metric. One `health-metrics` collection with a dimension field: each dimension has different writers, and separate collections let the spec show that only weight has an Owner `POST`.

**Consequences.** The metric id space is not unique across dimensions, since ids come from different sources. A `PUT` that names a different `petId` than the stored metric is `409` `conflict`, because an Activity does not move between Pets. Activity and Meal ids must stay stable for as long as their metric exists.
