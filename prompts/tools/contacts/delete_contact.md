# delete contact

## description

<!-- prompt: description -->
Delete one unambiguous saved contact when the current user requests deletion. Resolve the user's intended person across all observed candidates before selecting a UUID or reading one candidate; without a distinguishing user fact, stop that action and ask which person. Ranking, a model-selected UUID and a successful read are not human selection. Once unambiguous, read_contact in this request, then use its exact UUID and updated_at. Never repeat an uncertain write.
<!-- /prompt -->
