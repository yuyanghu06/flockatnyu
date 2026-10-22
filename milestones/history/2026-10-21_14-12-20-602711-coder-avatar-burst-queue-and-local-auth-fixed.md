# avatar burst queue and local auth fixed

- Local timestamp / acting role / milestone: 2026-10-21T14:12:20.602711-04:00 / coder / storage-avatars.
- Requested scope: fixnormalportraitburst and preserveprivateaccessbeforeStoragecutover.
- Work / evidence / decisions: Backend added FIFO64waiting/4active with original deadlines including wait, cancelled waiters removed beforeI/O, ignored-cancel work retains slot until settlement and sanitizedoverflow. Local avatar GET denies crosssitebrowserrequests beforeaccess. Coder45checks/APIbuild/whitespace pass; files frozen.
- Files/ownership: backendserver/avatarandappguidesonly; evaluatorread-only. Parentinspectedactualdeltaandserializesjournal.
- Result/handoff: uploads27private/hashverified;0profileURLs changed. Waitforfinalbrowser/regressionsandreviewedwebdeployment; Railwaycurrentlyreportsbuild/deploypause. No earlyprofilebackfill.
