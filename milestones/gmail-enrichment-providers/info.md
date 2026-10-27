# Daily Gmail enrichment provider policy

Goal: change only the separate daily Gmail enrichment service to try Apollo first and AIArk second, with a strict maximum of two providers total. The user cancelled CSV reprocessing and excluded website/tool changes.

Completion requires independent behavior/cost/logging/native-data verification and an isolated daily-service deployment retaining9AMNewYork/DST timing, privatevolume, raw-onlycache and existingbudgets. Root owns sharedtracking/deployment; coder ownsassigneddailyfiles and tester ownsindependenttests. Actualstateandhistory are in the rollingmilestone; privateproviderdata/credentials never belong here.

Implementation and live deployment are complete: isolated15-file service release0888a347 isSUCCESS, actual live-variable-backed read-only readiness isready, provider order Apollo→AIArk/max2 and existingbudgets/cron/privatevolume are verified. Independent final hosted configuration acceptance is complete; status: complete. No CSV rerun/manualpaidtest was performed; actual new-provider results await the normal scheduled run.
