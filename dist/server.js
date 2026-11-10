/* Agent Teams. Third-party code bundled into these files, and its licence: see THIRD_PARTY_LICENSES. */
var __defProp = Object.defineProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};

// src/server.js
import { Plugin } from "@opencode/plugin";

// node_modules/@opencode/schema/dist/session.js
var session_exports = {};
__export(session_exports, {
  Event: () => Event11,
  ForkBoundary: () => ForkBoundary,
  ID: () => ID14,
  Info: () => Info16,
  ListAnchor: () => ListAnchor,
  ListCursor: () => ListCursor,
  ListFilter: () => ListFilter,
  Metadata: () => Metadata3,
  Revert: () => Revert,
  Session: () => session_exports
});
import { Effect as Effect4, Result, Schema as Schema36, SchemaGetter as SchemaGetter2, SchemaParser } from "effect";
import { Base64Url } from "effect/encoding";

// node_modules/@opencode/schema/dist/agent.js
var agent_exports = {};
__export(agent_exports, {
  Agent: () => agent_exports,
  Color: () => Color,
  Event: () => Event7,
  ID: () => ID8,
  Info: () => Info7,
  Name: () => Name
});
import { Schema as Schema17 } from "effect";

// node_modules/@opencode/schema/dist/event.js
var event_exports = {};
__export(event_exports, {
  Event: () => event_exports,
  ID: () => ID,
  Seq: () => Seq,
  Version: () => Version,
  durable: () => durable,
  durableMap: () => durableMap,
  ephemeral: () => ephemeral,
  inventory: () => inventory,
  latest: () => latest,
  versionedType: () => versionedType
});
import { Schema as Schema5, SchemaTransformation } from "effect";

// node_modules/@opencode/schema/dist/schema.js
import { DateTime, Option, Schema, SchemaGetter } from "effect";
var PositiveInt = Schema.Int.check(Schema.isGreaterThan(0));
var NonNegativeInt = Schema.Int.check(Schema.isGreaterThanOrEqualTo(0));
var RelativePath = Schema.String.pipe(Schema.brand("RelativePath"), Schema.annotate({ identifier: "RelativePath" }));
var AbsolutePath = Schema.String.pipe(Schema.brand("AbsolutePath"), Schema.annotate({ identifier: "AbsolutePath" }));
var optional = (schema) => Schema.optionalKey(schema).pipe(Schema.decodeTo(Schema.optional(Schema.toType(schema)), {
  decode: SchemaGetter.passthrough({ strict: false }),
  encode: SchemaGetter.transformOptional(Option.filter((value) => value !== void 0))
}));
var withStatics = (schema, methods) => Object.defineProperties(schema, Object.getOwnPropertyDescriptors(methods));
var statics = (methods) => (schema) => withStatics(schema, methods(schema));
var DateTimeUtcFromMillis = Schema.Finite.pipe(Schema.decodeTo(Schema.DateTimeUtc, {
  decode: SchemaGetter.transform((value) => DateTime.makeUnsafe(value)),
  encode: SchemaGetter.transform((value) => DateTime.toEpochMillis(value))
}));

// node_modules/@opencode/schema/dist/identifier.js
var length = 26;
var chars = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";
var lastTimestamp = 0;
var counter = 0;
function ascending() {
  return create(false);
}
function descending() {
  return create(true);
}
function create(descending2, timestamp = Date.now()) {
  if (timestamp !== lastTimestamp) {
    lastTimestamp = timestamp;
    counter = 0;
  }
  counter++;
  const current = BigInt(timestamp) * 0x1000n + BigInt(counter);
  const value = descending2 ? ~current : current;
  const time = Array.from({ length: 6 }, (_2, index) => Number(value >> BigInt(40 - 8 * index) & 0xffn).toString(16).padStart(2, "0")).join("");
  const bytes = crypto.getRandomValues(new Uint8Array(length - 12));
  return time + Array.from(bytes, (byte) => chars[byte % 62]).join("");
}

// node_modules/@opencode/schema/dist/location.js
var location_exports = {};
__export(location_exports, {
  Info: () => Info,
  Location: () => location_exports,
  PublicInfo: () => PublicInfo,
  PublicRef: () => PublicRef,
  Ref: () => Ref,
  response: () => response
});
import { Schema as Schema4, Struct } from "effect";

// node_modules/@opencode/schema/dist/project-id.js
import { Schema as Schema2 } from "effect";
var ProjectID = Schema2.String.pipe(Schema2.brand("Project.ID"), Schema2.annotate({ identifier: "Project.ID" }), statics((schema) => ({ global: schema.make("global") })));

// node_modules/@opencode/schema/dist/workspace-id.js
import { Schema as Schema3 } from "effect";
var WorkspaceID = Schema3.String.check(Schema3.isStartingWith("wrk")).pipe(Schema3.brand("Workspace.ID"), Schema3.annotate({ identifier: "Workspace.ID" }), statics((schema) => {
  const create2 = () => schema.make("wrk_" + ascending());
  return {
    ascending: (id2) => {
      if (!id2)
        return create2();
      return schema.make(id2);
    },
    create: create2
  };
}));

// node_modules/@opencode/schema/dist/location.js
var Ref = Schema4.Struct({
  directory: AbsolutePath,
  workspaceID: optional(WorkspaceID)
}).annotate({ identifier: "Location.Ref" });
var PublicRef = Schema4.Struct(Struct.omit(Ref.fields, ["workspaceID"])).annotate({
  identifier: "Location.PublicRef"
});
var Info = class extends Schema4.Class("Location.Info")({
  directory: AbsolutePath,
  workspaceID: optional(WorkspaceID),
  project: Schema4.Struct({
    id: ProjectID,
    directory: AbsolutePath,
    canonical: AbsolutePath
  })
}) {
};
var PublicInfo = Schema4.Struct(Struct.omit(Info.fields, ["workspaceID"])).annotate({
  identifier: "Location.PublicInfo"
});
function response(data) {
  return Schema4.Struct({ location: PublicRef, data });
}

// node_modules/@opencode/schema/dist/event.js
var ID = Schema5.String.check(Schema5.isStartingWith("evt_")).pipe(Schema5.brand("Event.ID"), Schema5.annotate({ identifier: "Event.ID" }), statics((schema) => ({ create: () => schema.make("evt_" + ascending()) })));
var Seq = Schema5.Int.check(Schema5.isGreaterThanOrEqualTo(0)).pipe(Schema5.brand("Event.Seq"), Schema5.annotate({ identifier: "Event.Seq" }));
var Version = Schema5.Int.check(Schema5.isGreaterThanOrEqualTo(1)).pipe(Schema5.brand("Event.Version"), Schema5.annotate({ identifier: "Event.Version" }));
var DurableEnvelope = Schema5.Struct({ aggregateID: Schema5.String, seq: Seq, version: Version });
function durable(input) {
  const data = Schema5.Struct(input.schema);
  const durable2 = Schema5.Struct({
    aggregateID: DurableEnvelope.fields.aggregateID,
    seq: DurableEnvelope.fields.seq,
    version: Schema5.Literal(input.durable.version).pipe(Schema5.decodeTo(Schema5.toType(Version), SchemaTransformation.transform({
      decode: () => Version.make(input.durable.version),
      encode: () => input.durable.version
    })))
  });
  return Schema5.Struct({
    id: ID,
    created: Schema5.Finite,
    metadata: optional(Schema5.Record(Schema5.String, Schema5.Unknown)),
    type: Schema5.Literal(input.type),
    durable: durable2,
    location: optional(location_exports.Ref),
    data
  }).annotate({ identifier: input.identifier ?? input.type }).pipe(statics(() => ({
    type: input.type,
    durability: "durable",
    durable: input.durable,
    data
  })));
}
function ephemeral(input) {
  const data = Schema5.Struct(input.schema);
  return Schema5.Struct({
    id: ID,
    created: Schema5.Finite,
    metadata: optional(Schema5.Record(Schema5.String, Schema5.Unknown)),
    type: Schema5.Literal(input.type),
    location: optional(location_exports.Ref),
    data
  }).annotate({ identifier: input.identifier ?? input.type }).pipe(statics(() => ({
    type: input.type,
    durability: "ephemeral",
    durable: void 0,
    data
  })));
}
function inventory(...definitions) {
  return Object.freeze(definitions);
}
function latest(definitions) {
  return readonlyMap(definitions.reduce((result, definition) => {
    const existing = result.get(definition.type);
    if (!existing) {
      result.set(definition.type, definition);
      return result;
    }
    if (definition.durable && existing.durable && definition.durable.version !== existing.durable.version) {
      if (definition.durable.version > existing.durable.version)
        result.set(definition.type, definition);
      return result;
    }
    if (definition !== existing)
      throw new Error(`Duplicate latest event definition for ${definition.type}`);
    return result;
  }, /* @__PURE__ */ new Map()));
}
function versionedType(type, version) {
  return `${type}.${version}`;
}
function durableMap(definitions) {
  return readonlyMap(definitions.reduce((result, definition) => {
    if (definition.durability !== "durable")
      return result;
    const key = versionedType(definition.type, definition.durable.version);
    if (result.has(key))
      throw new Error(`Duplicate durable event definition for ${key}`);
    result.set(key, definition);
    return result;
  }, /* @__PURE__ */ new Map()));
}
function readonlyMap(map) {
  const result = Object.freeze({
    get size() {
      return map.size;
    },
    entries: () => map.entries(),
    forEach: (callback, thisArg) => map.forEach((value, key) => callback.call(thisArg, value, key, result)),
    get: (key) => map.get(key),
    has: (key) => map.has(key),
    keys: () => map.keys(),
    values: () => map.values(),
    [Symbol.iterator]: () => map[Symbol.iterator]()
  });
  return result;
}

// node_modules/@opencode/schema/dist/model.js
var model_exports = {};
__export(model_exports, {
  Capabilities: () => Capabilities,
  Compatibility: () => Compatibility,
  Cost: () => Cost,
  Event: () => Event5,
  Family: () => Family,
  ID: () => ID6,
  Info: () => Info6,
  MaxTokensField: () => MaxTokensField,
  MediaInput: () => MediaInput,
  Model: () => model_exports,
  Overlays: () => Overlays2,
  ReasoningField: () => ReasoningField,
  Ref: () => Ref3,
  Settings: () => Settings2,
  Type: () => Type,
  Variant: () => Variant,
  VariantID: () => VariantID
});
import { Schema as Schema14, Struct as Struct3 } from "effect";

// node_modules/@opencode/schema/dist/provider.js
var provider_exports = {};
__export(provider_exports, {
  Activation: () => Activation,
  Cache: () => Cache,
  CacheTTL: () => CacheTTL,
  Compaction: () => Compaction,
  Encoding: () => Encoding,
  Event: () => Event4,
  ID: () => ID5,
  Info: () => Info5,
  Overlays: () => Overlays,
  Package: () => Package,
  Provider: () => provider_exports,
  Request: () => Request,
  Settings: () => Settings,
  Transport: () => Transport
});
import { Effect, Schema as Schema12 } from "effect";

// node_modules/@opencode/schema/dist/integration.js
var integration_exports = {};
__export(integration_exports, {
  Attempt: () => Attempt,
  AttemptID: () => AttemptID,
  AttemptStatus: () => AttemptStatus,
  CommandAttempt: () => CommandAttempt,
  CommandAttemptStatus: () => CommandAttemptStatus,
  CommandMethod: () => CommandMethod,
  EnvMethod: () => EnvMethod,
  Event: () => Event3,
  ExternalMethod: () => ExternalMethod,
  ID: () => ID4,
  Info: () => Info4,
  Integration: () => integration_exports,
  KeyMethod: () => KeyMethod,
  Method: () => Method,
  MethodID: () => MethodID,
  OAuthMethod: () => OAuthMethod,
  Ref: () => Ref2
});
import { Schema as Schema10 } from "effect";

// node_modules/@opencode/schema/dist/connection.js
var connection_exports = {};
__export(connection_exports, {
  Connection: () => connection_exports,
  CredentialInfo: () => CredentialInfo,
  EnvInfo: () => EnvInfo,
  Info: () => Info2,
  Status: () => Status
});
import { Schema as Schema8 } from "effect";

// node_modules/@opencode/schema/dist/credential.js
var credential_exports = {};
__export(credential_exports, {
  CreateInput: () => CreateInput,
  Credential: () => credential_exports,
  Entry: () => Entry,
  Event: () => Event,
  External: () => External,
  ID: () => ID2,
  Key: () => Key,
  OAuth: () => OAuth,
  Value: () => Value
});
import { Schema as Schema7 } from "effect";

// node_modules/@opencode/schema/dist/integration-id.js
import { Schema as Schema6 } from "effect";
var IntegrationID = Schema6.String.pipe(Schema6.brand("Integration.ID"), Schema6.annotate({ identifier: "Integration.ID" }));
var IntegrationMethodID = Schema6.String.pipe(Schema6.brand("Integration.MethodID"), Schema6.annotate({ identifier: "Integration.MethodID" }));

// node_modules/@opencode/schema/dist/credential.js
var ID2 = Schema7.String.pipe(Schema7.brand("Credential.ID"), Schema7.annotate({ identifier: "Credential.ID" }), statics((schema) => ({ create: () => schema.make("cred_" + ascending()) })));
var Updated = ephemeral({
  type: "credential.updated",
  schema: {}
});
var Switched = ephemeral({
  type: "credential.switched",
  schema: { integrationID: IntegrationID, credentialID: Schema7.NullOr(ID2) }
});
var Event = {
  Updated,
  Switched,
  Definitions: inventory(Updated, Switched)
};
var OAuth = Schema7.Struct({
  type: Schema7.Literal("oauth"),
  methodID: IntegrationMethodID,
  refresh: Schema7.String,
  access: Schema7.String,
  expires: NonNegativeInt,
  metadata: optional(Schema7.Record(Schema7.String, Schema7.Unknown))
}).annotate({ identifier: "Credential.OAuth" });
var Key = Schema7.Struct({
  type: Schema7.Literal("key"),
  key: Schema7.String,
  metadata: optional(Schema7.Record(Schema7.String, Schema7.Unknown))
}).annotate({ identifier: "Credential.Key" });
var External = Schema7.Struct({
  type: Schema7.Literal("external"),
  methodID: IntegrationMethodID,
  metadata: optional(Schema7.Record(Schema7.String, Schema7.Unknown))
}).annotate({ identifier: "Credential.External" });
var Value = Schema7.Union([OAuth, Key, External]).pipe(Schema7.toTaggedUnion("type")).annotate({ identifier: "Credential.Value" });
var Entry = Schema7.Struct({
  id: ID2,
  integrationID: IntegrationID,
  label: Schema7.String,
  active: Schema7.Boolean,
  value: Value
}).annotate({ identifier: "Credential.Entry" });
var CreateInput = Schema7.Struct({
  id: optional(ID2),
  integrationID: IntegrationID,
  label: optional(Schema7.String),
  value: Value,
  activate: optional(Schema7.Boolean)
}).annotate({ identifier: "Credential.CreateInput" });

// node_modules/@opencode/schema/dist/connection.js
var Status = Schema8.Struct({
  status: Schema8.Literals(["needs_auth"]),
  message: Schema8.String,
  url: optional(Schema8.String)
}).annotate({ identifier: "Connection.Status" });
var CredentialInfo = Schema8.Struct({
  type: Schema8.Literal("credential"),
  id: credential_exports.ID,
  label: Schema8.String,
  /** Whether the connection stores a key, an OAuth grant, or an external credential-source reference. */
  method: Schema8.Literals(["key", "oauth", "external"]),
  status: optional(Status)
}).annotate({ identifier: "Connection.CredentialInfo" });
var EnvInfo = Schema8.Struct({
  type: Schema8.Literal("env"),
  name: Schema8.String,
  status: optional(Status)
}).annotate({ identifier: "Connection.EnvInfo" });
var Info2 = Schema8.Union([CredentialInfo, EnvInfo]).pipe(Schema8.toTaggedUnion("type")).annotate({ identifier: "Connection.Info" });

// node_modules/@opencode/schema/dist/form.js
var form_exports = {};
__export(form_exports, {
  Answer: () => Answer,
  BooleanField: () => BooleanField,
  Detail: () => Detail,
  Event: () => Event2,
  ExternalField: () => ExternalField,
  Field: () => Field,
  Fields: () => Fields,
  Form: () => form_exports,
  ID: () => ID3,
  Info: () => Info3,
  IntegerField: () => IntegerField,
  Metadata: () => Metadata,
  MultiselectField: () => MultiselectField,
  NumberField: () => NumberField,
  Option: () => Option2,
  Reply: () => Reply,
  State: () => State,
  StringField: () => StringField,
  Value: () => Value2,
  When: () => When
});
import { Schema as Schema9 } from "effect";
var IDSchema = Schema9.String.check(Schema9.isStartingWith("frm_")).pipe(Schema9.brand("Form.ID"), Schema9.annotate({ identifier: "Form.ID" }));
var ID3 = IDSchema.pipe(statics((schema) => ({ create: (id2) => schema.make(id2 ?? "frm_" + ascending()) })));
var Metadata = Schema9.Record(Schema9.String, Schema9.Unknown).annotate({ identifier: "Form.Metadata" });
var Option2 = Schema9.Struct({
  value: Schema9.String,
  label: Schema9.String,
  description: Schema9.String.pipe(optional)
}).annotate({ identifier: "Form.Option" });
var When = Schema9.Struct({
  key: Schema9.String,
  op: Schema9.Literals(["eq", "neq"]),
  value: Schema9.Union([Schema9.String, Schema9.Number, Schema9.Boolean])
}).annotate({ identifier: "Form.When" });
var FieldBase = {
  key: Schema9.String,
  title: Schema9.String.pipe(optional),
  description: Schema9.String.pipe(optional),
  required: Schema9.Boolean.pipe(optional),
  hidden: Schema9.Boolean.pipe(optional).annotate({
    description: "Skip the interactive authentication prompt and use the default unless an answer is supplied"
  }),
  when: Schema9.Array(When).pipe(optional)
};
var StringField = Schema9.Struct({
  ...FieldBase,
  type: Schema9.Literal("string"),
  format: Schema9.Literals(["email", "uri", "date", "date-time"]).pipe(optional),
  minLength: NonNegativeInt.pipe(optional),
  maxLength: NonNegativeInt.pipe(optional),
  pattern: Schema9.String.pipe(optional),
  placeholder: Schema9.String.pipe(optional),
  default: Schema9.String.pipe(optional),
  options: Schema9.Array(Option2).pipe(optional),
  custom: Schema9.Boolean.pipe(optional)
}).annotate({ identifier: "Form.StringField" });
var NumberField = Schema9.Struct({
  ...FieldBase,
  type: Schema9.Literal("number"),
  minimum: Schema9.Number.pipe(optional),
  maximum: Schema9.Number.pipe(optional),
  default: Schema9.Number.pipe(optional)
}).annotate({ identifier: "Form.NumberField" });
var IntegerField = Schema9.Struct({
  ...FieldBase,
  type: Schema9.Literal("integer"),
  minimum: Schema9.Number.pipe(optional),
  maximum: Schema9.Number.pipe(optional),
  default: Schema9.Number.pipe(optional)
}).annotate({ identifier: "Form.IntegerField" });
var BooleanField = Schema9.Struct({
  ...FieldBase,
  type: Schema9.Literal("boolean"),
  default: Schema9.Boolean.pipe(optional)
}).annotate({ identifier: "Form.BooleanField" });
var MultiselectField = Schema9.Struct({
  ...FieldBase,
  type: Schema9.Literal("multiselect"),
  options: Schema9.Array(Option2),
  minItems: NonNegativeInt.pipe(optional),
  maxItems: NonNegativeInt.pipe(optional),
  custom: Schema9.Boolean.pipe(optional),
  default: Schema9.Array(Schema9.String).pipe(optional)
}).annotate({ identifier: "Form.MultiselectField" });
var ExternalField = Schema9.Struct({
  key: Schema9.String,
  type: Schema9.Literal("external"),
  url: Schema9.String,
  title: Schema9.String.pipe(optional),
  description: Schema9.String.pipe(optional)
}).annotate({ identifier: "Form.ExternalField" });
var Field = Schema9.Union([
  StringField,
  NumberField,
  IntegerField,
  BooleanField,
  MultiselectField,
  ExternalField
]).pipe(Schema9.toTaggedUnion("type"), Schema9.annotate({ identifier: "Form.Field" }));
var Fields = Schema9.NonEmptyArray(Field).annotate({ identifier: "Form.Fields" });
var InfoBase = {
  id: ID3,
  // This should be typed as SessionID. It is a plain string only because MCP elicitation
  // temporarily needs the `"global"` sentinel owner, which is not a real session. Once
  // elicitations can be attributed to real sessions, revert this to SessionID. Do not rely
  // on non-session owners anywhere else.
  sessionID: Schema9.String,
  title: Schema9.String,
  metadata: Metadata.pipe(optional)
};
var Info3 = Schema9.Struct({
  ...InfoBase,
  fields: Fields
}).annotate({ identifier: "Form.Info" });
var Value2 = Schema9.Union([Schema9.String, Schema9.Number, Schema9.Boolean, Schema9.Array(Schema9.String)]).annotate({
  identifier: "Form.Value"
});
var Answer = Schema9.Record(Schema9.String, Value2).annotate({ identifier: "Form.Answer" });
var State = Schema9.Union([
  Schema9.Struct({ status: Schema9.Literal("pending") }),
  Schema9.Struct({ status: Schema9.Literal("answered"), answer: Answer }),
  // A message tells the asker why nobody answered, e.g. a non-interactive client.
  Schema9.Struct({ status: Schema9.Literal("cancelled"), message: Schema9.String.pipe(optional) })
]).pipe(Schema9.toTaggedUnion("status")).annotate({ identifier: "Form.State" });
var Detail = Schema9.Struct({
  ...Info3.fields,
  state: State
}).annotate({ identifier: "Form.Detail" });
var Reply = Schema9.Struct({
  answer: Answer
}).annotate({ identifier: "Form.Reply" });
var Created = ephemeral({ type: "form.created", schema: { form: Info3 } });
var Replied = ephemeral({ type: "form.replied", schema: { id: ID3, sessionID: Schema9.String, answer: Answer } });
var Cancelled = ephemeral({ type: "form.cancelled", schema: { id: ID3, sessionID: Schema9.String } });
var Event2 = { Created, Replied, Cancelled, Definitions: inventory(Created, Replied, Cancelled) };

// node_modules/@opencode/schema/dist/integration.js
var ID4 = IntegrationID;
var MethodID = IntegrationMethodID;
var OAuthMethod = Schema10.Struct({
  id: MethodID,
  type: Schema10.Literal("oauth"),
  label: Schema10.String,
  form: optional(form_exports.Fields)
}).annotate({ identifier: "Integration.OAuthMethod" });
var CommandMethod = Schema10.Struct({
  id: MethodID,
  type: Schema10.Literal("command"),
  label: Schema10.String,
  command: Schema10.Array(Schema10.String)
}).annotate({ identifier: "Integration.CommandMethod" });
var KeyMethod = Schema10.Struct({
  type: Schema10.Literal("key"),
  label: optional(Schema10.String),
  form: optional(form_exports.Fields)
}).annotate({ identifier: "Integration.KeyMethod" });
var ExternalMethod = Schema10.Struct({
  id: MethodID,
  type: Schema10.Literal("external"),
  label: Schema10.String,
  form: optional(form_exports.Fields)
}).annotate({ identifier: "Integration.ExternalMethod" });
var EnvMethod = Schema10.Struct({
  type: Schema10.Literal("env"),
  names: Schema10.Array(Schema10.String)
}).annotate({ identifier: "Integration.EnvMethod" });
var Method = Schema10.Union([OAuthMethod, CommandMethod, KeyMethod, ExternalMethod, EnvMethod]).pipe(Schema10.toTaggedUnion("type")).annotate({ identifier: "Integration.Method" });
var Updated2 = ephemeral({
  type: "integration.updated",
  schema: {}
});
var Event3 = { Updated: Updated2, Definitions: inventory(Updated2) };
var Ref2 = Schema10.Struct({
  id: ID4,
  name: Schema10.String,
  metadata: optional(Schema10.Record(Schema10.String, Schema10.Any))
}).annotate({ identifier: "Integration.Ref" });
var Info4 = Schema10.Struct({
  id: ID4,
  name: Schema10.String,
  metadata: optional(Schema10.Record(Schema10.String, Schema10.Any)),
  methods: Schema10.Array(Method),
  connections: Schema10.Array(connection_exports.Info)
}).annotate({ identifier: "Integration.Info" });
var AttemptID = Schema10.String.pipe(Schema10.brand("Integration.AttemptID"), Schema10.annotate({ identifier: "Integration.AttemptID" }), statics((schema) => ({ create: () => schema.make("con_" + ascending()) })));
var AttemptTime = Schema10.Struct({
  created: Schema10.Number,
  expires: Schema10.Number
});
var Attempt = class extends Schema10.Class("Integration.Attempt")({
  attemptID: AttemptID,
  url: Schema10.String,
  instructions: Schema10.String,
  mode: Schema10.Literals(["auto", "code"]),
  time: AttemptTime
}) {
};
var AttemptStatus = Schema10.Union([
  Schema10.Struct({ status: Schema10.Literal("pending"), time: AttemptTime }),
  Schema10.Struct({ status: Schema10.Literal("complete"), time: AttemptTime }),
  Schema10.Struct({ status: Schema10.Literal("failed"), message: Schema10.String, time: AttemptTime }),
  Schema10.Struct({ status: Schema10.Literal("expired"), time: AttemptTime })
]).pipe(Schema10.toTaggedUnion("status")).annotate({ identifier: "Integration.AttemptStatus" });
var CommandAttempt = Schema10.Struct({
  attemptID: AttemptID,
  time: AttemptTime
}).annotate({ identifier: "Integration.CommandAttempt" });
var CommandAttemptStatus = Schema10.Union([
  Schema10.Struct({ status: Schema10.Literal("pending"), message: optional(Schema10.String), time: AttemptTime }),
  Schema10.Struct({ status: Schema10.Literal("complete"), time: AttemptTime }),
  Schema10.Struct({ status: Schema10.Literal("failed"), message: Schema10.String, time: AttemptTime }),
  Schema10.Struct({ status: Schema10.Literal("expired"), time: AttemptTime })
]).pipe(Schema10.toTaggedUnion("status")).annotate({ identifier: "Integration.CommandAttemptStatus" });

// node_modules/@opencode/schema/dist/model-compatibility.js
import { Schema as Schema11, Struct as Struct2 } from "effect";
var ReasoningField = Schema11.Union([
  Schema11.Literals(["reasoning", "reasoning_content", "reasoning_text"]),
  Schema11.String
]).annotate({ identifier: "Model.ReasoningField" });
var MaxTokensField = Schema11.Literals(["max_completion_tokens", "max_tokens"]).annotate({
  identifier: "Model.MaxTokensField"
});
var MediaInput = Schema11.Literals(["assets", "state", "root"]).annotate({
  identifier: "Model.MediaInput"
});
var CacheFormat = Schema11.Literals(["anthropic", "alibaba"]).annotate({ identifier: "Model.CacheFormat" });
var Compatibility = Schema11.Struct({
  /** OpenAI Chat: assistant-message field that carries reasoning. Unset uses the streamed field, else `reasoning_content`. */
  reasoningField: ReasoningField.pipe(optional),
  /** OpenAI Chat: send the reasoning field on every prior assistant message, even when empty. */
  requireReasoning: Schema11.Boolean.pipe(optional),
  /** OpenAI Chat: body field for the output token limit. Unset detects it from the provider. */
  maxTokensField: MaxTokensField.pipe(optional),
  /** OpenAI Chat: fail a stream that ends without `finish_reason`. Defaults to true. */
  requireFinishReason: Schema11.Boolean.pipe(optional),
  /** OpenAI Chat: insert an assistant message between a tool result and the next user message. */
  requireAssistantAfterTool: Schema11.Boolean.pipe(optional),
  /** OpenAI Chat, OpenAI Responses and Mistral: whether the endpoint accepts `prompt_cache_key`. */
  supportsPromptCacheKey: Schema11.Boolean.pipe(optional),
  /** OpenAI Chat: request usage in the stream with `stream_options.include_usage`. Defaults to true. */
  streamUsage: Schema11.Boolean.pipe(optional),
  /** Prompt-cache marker syntax the endpoint accepts. Overrides the route default; both send `cache_control`, and `alibaba` skips tool definitions. */
  cacheFormat: CacheFormat.pipe(optional),
  /** Anthropic Messages and Bedrock Converse: supports Anthropic's thinking-prefix mismatch controls. Overrides model-ID detection. */
  supportsThinkingBlockBinding: Schema11.Boolean.pipe(optional),
  /** Anthropic Messages and OpenAI Responses: supports per-message effort updates. Overrides model-ID detection. */
  supportsEffortUpdates: Schema11.Boolean.pipe(optional),
  /** System One: where the decision host reads media. Unset keeps the route default. */
  mediaInput: MediaInput.pipe(optional)
}).annotate({ identifier: "Model.Compatibility" });
var ProviderCompatibility = Schema11.Struct(Struct2.omit(Compatibility.fields, ["supportsThinkingBlockBinding", "supportsEffortUpdates"])).annotate({ identifier: "Provider.Compatibility" });

// node_modules/@opencode/schema/dist/provider.js
var ID5 = Schema12.String.pipe(Schema12.brand("Provider.ID"), Schema12.annotate({ identifier: "Provider.ID" }), statics((schema) => ({
  opencode: schema.make("opencode"),
  anthropic: schema.make("anthropic"),
  openai: schema.make("openai"),
  google: schema.make("google"),
  googleVertex: schema.make("google-vertex"),
  githubCopilot: schema.make("github-copilot"),
  claudeAgent: schema.make("claude-agent"),
  amazonBedrock: schema.make("amazon-bedrock"),
  azure: schema.make("azure"),
  openrouter: schema.make("openrouter"),
  mistral: schema.make("mistral"),
  gitlab: schema.make("gitlab")
})));
var Updated3 = ephemeral({ type: "provider.updated", schema: {} });
var Event4 = { Updated: Updated3, Definitions: inventory(Updated3) };
var Package = Schema12.String;
var Activation = Schema12.Literals(["auto", "enabled", "disabled"]);
var Compaction = Schema12.Union([
  Schema12.Struct({ type: Schema12.Literal("summary") }),
  Schema12.Struct({ type: Schema12.Literal("native") })
]).pipe(Schema12.toTaggedUnion("type")).annotate({ identifier: "Provider.Compaction" });
var Transport = Schema12.Literals(["http", "websocket"]).annotate({ identifier: "Provider.Transport" });
var CacheTTL = Schema12.TemplateLiteral([Schema12.Number, Schema12.Literals(["ms", "s", "m", "h", "d"])]).check(Schema12.isPattern(/^\d+(ms|s|m|h|d)$/)).annotate({ identifier: "Provider.CacheTTL" });
var Cache = Schema12.Struct({
  ttl: CacheTTL.pipe(optional)
}).annotate({ identifier: "Provider.Cache" });
var Encoding = Schema12.Literals(["zstd", "gzip", "none"]).annotate({ identifier: "Provider.Encoding" });
var Timeout = Schema12.Union([Schema12.Finite, Schema12.Literal(false)]).pipe(optional);
var Settings = Schema12.StructWithRest(Schema12.Struct({
  timeout: Timeout,
  headerTimeout: Timeout,
  chunkTimeout: Timeout,
  compaction: Compaction.pipe(optional),
  cache: Cache.pipe(optional),
  transport: Transport.pipe(optional),
  encoding: Encoding.pipe(optional)
}), [Schema12.Record(Schema12.String, Schema12.Any)]).annotate({ identifier: "Provider.Settings" });
var Overlays = {
  settings: Settings.pipe(optional),
  headers: Schema12.Record(Schema12.String, Schema12.String).pipe(optional),
  body: Schema12.Record(Schema12.String, Schema12.Any).pipe(optional)
};
var Request = Schema12.Struct({
  settings: Settings.pipe(Schema12.withConstructorDefault(Effect.succeed({}))),
  headers: Schema12.Record(Schema12.String, Schema12.String),
  body: Schema12.Record(Schema12.String, Schema12.Any)
}).annotate({ identifier: "Provider.Request" });
var Info5 = Schema12.Struct({
  id: ID5,
  canonical: ID5.pipe(optional),
  integrationID: integration_exports.ID.pipe(optional),
  name: Schema12.String,
  activation: Activation,
  package: Package,
  /** Inherited by every model of this provider; model compatibility overrides individual fields. */
  compatibility: ProviderCompatibility.pipe(optional),
  ...Overlays
}).annotate({ identifier: "Provider.Info" }).pipe(statics(() => ({
  empty: (id2) => ({ id: id2, name: id2, activation: "auto", package: "" })
})));

// node_modules/@opencode/schema/dist/money.js
var money_exports = {};
__export(money_exports, {
  Money: () => money_exports,
  USD: () => USD,
  USDPerMillionTokens: () => USDPerMillionTokens
});
import { Schema as Schema13 } from "effect";
var USD = Schema13.Finite.pipe(Schema13.brand("Money.USD"), Schema13.annotate({ identifier: "Money.USD" }), statics((schema) => ({ zero: schema.make(0) })));
var USDPerMillionTokens = Schema13.Finite.pipe(Schema13.brand("Money.USDPerMillionTokens"), Schema13.annotate({ identifier: "Money.USDPerMillionTokens" }), statics((schema) => ({ zero: schema.make(0) })));

// node_modules/@opencode/schema/dist/model.js
var ID6 = Schema14.String.pipe(Schema14.brand("Model.ID"));
var Updated4 = ephemeral({ type: "model.updated", schema: {} });
var Event5 = { Updated: Updated4, Definitions: inventory(Updated4) };
var VariantID = Schema14.String.pipe(Schema14.brand("Model.VariantID"));
var Ref3 = Schema14.Struct({
  id: ID6,
  providerID: provider_exports.ID,
  variant: VariantID.pipe(optional)
}).annotate({ identifier: "Model.Ref" }).pipe(statics((schema) => ({
  parse: (input) => {
    const providerEnd = input.indexOf("/");
    if (providerEnd <= 0)
      throw new Error(`Invalid model reference: ${input}`);
    const providerID = input.slice(0, providerEnd);
    const variantStart = input.indexOf("#", providerEnd + 1);
    const id2 = input.slice(providerEnd + 1, variantStart === -1 ? void 0 : variantStart);
    const variant = variantStart === -1 ? void 0 : input.slice(variantStart + 1);
    if (!id2 || providerID.includes("#") || variant !== void 0 && (!variant || variant.includes("#")))
      throw new Error(`Invalid model reference: ${input}`);
    return schema.make({
      providerID: provider_exports.ID.make(providerID),
      id: ID6.make(id2),
      ...variant ? { variant: VariantID.make(variant) } : {}
    });
  }
})));
var Family = Schema14.String.pipe(Schema14.brand("Model.Family"));
var Type = Schema14.Union([
  Schema14.Literals(["chat", "decision", "image"]),
  Schema14.String
]).annotate({ identifier: "Model.Type" });
var Settings2 = Schema14.StructWithRest(
  Schema14.Struct(Struct3.pick(provider_exports.Settings.schema.fields, ["compaction", "cache", "encoding"])),
  // Provider packages may define arbitrary model-level options beyond OpenCode's shared compaction policy.
  [Schema14.Record(Schema14.String, Schema14.Any)]
).annotate({ identifier: "Model.Settings" });
var VariantSettings = Schema14.StructWithRest(Schema14.Struct(Struct3.omit(Settings2.schema.fields, ["cache"])), Settings2.records).annotate({ identifier: "Model.VariantSettings" });
var Overlays2 = {
  settings: Settings2.pipe(optional),
  headers: Schema14.Record(Schema14.String, Schema14.String).pipe(optional),
  body: Schema14.Record(Schema14.String, Schema14.Any).pipe(optional)
};
var Capabilities = Schema14.Struct({
  tools: Schema14.Boolean,
  input: Schema14.Array(Schema14.String),
  output: Schema14.Array(Schema14.String),
  /** Whether the model accepts a sampling temperature. Unknown when unset. */
  temperature: Schema14.Boolean.pipe(optional)
}).annotate({ identifier: "Model.Capabilities" }).pipe(statics(() => ({
  default: () => ({ tools: true, input: ["text", "image"], output: ["text"] })
})));
var Cost = Schema14.Struct({
  tier: Schema14.Struct({
    type: Schema14.tag("context"),
    size: Schema14.Int
  }).pipe(optional),
  input: money_exports.USDPerMillionTokens,
  output: money_exports.USDPerMillionTokens,
  cache: Schema14.Struct({
    read: money_exports.USDPerMillionTokens,
    write: money_exports.USDPerMillionTokens
  })
}).annotate({ identifier: "Model.Cost" });
var Variant = Schema14.Struct({
  id: VariantID,
  ...Overlays2,
  settings: VariantSettings.pipe(optional)
}).annotate({ identifier: "Model.Variant" });
var Info6 = Schema14.Struct({
  id: ID6,
  modelID: ID6,
  providerID: provider_exports.ID,
  canonical: provider_exports.ID.pipe(optional),
  type: Type.pipe(optional),
  family: Family.pipe(optional),
  name: Schema14.String,
  compatibility: Compatibility.pipe(optional),
  package: provider_exports.Package.pipe(optional),
  ...Overlays2,
  capabilities: Capabilities,
  variants: Schema14.Array(Variant),
  time: Schema14.Struct({
    released: Schema14.Finite
  }),
  cost: Schema14.Array(Cost),
  status: Schema14.Literals(["alpha", "beta", "deprecated", "active"]),
  enabled: Schema14.Boolean,
  limit: Schema14.Struct({
    context: Schema14.Int,
    input: Schema14.Int.pipe(optional),
    output: Schema14.Int
  })
}).annotate({ identifier: "Model.Info" }).pipe(statics(() => ({
  default: (providerID, id2) => ({
    id: id2,
    modelID: id2,
    providerID,
    name: id2,
    capabilities: Capabilities.default(),
    variants: [],
    time: { released: 0 },
    cost: [],
    status: "active",
    enabled: true,
    limit: { context: 2e5, output: 32e3 }
  })
})));

// node_modules/@opencode/schema/dist/permission.js
var permission_exports = {};
__export(permission_exports, {
  Effect: () => Effect2,
  Event: () => Event6,
  ID: () => ID7,
  Permission: () => permission_exports,
  Reply: () => Reply2,
  Request: () => Request2,
  Rule: () => Rule,
  Ruleset: () => Ruleset,
  Source: () => Source
});
import { Schema as Schema16 } from "effect";

// node_modules/@opencode/schema/dist/session-id.js
import { Schema as Schema15 } from "effect";
var SessionID = Schema15.String.check(Schema15.isStartingWith("ses")).pipe(Schema15.brand("SessionID"), Schema15.annotate({ identifier: "Session.ID" }), statics((schema) => ({
  create: () => schema.make("ses_" + descending())
})));

// node_modules/@opencode/schema/dist/permission.js
var ID7 = Schema16.String.check(Schema16.isStartingWith("per")).pipe(Schema16.brand("Permission.ID"), Schema16.annotate({ identifier: "Permission.ID" }), statics((schema) => ({ create: (id2) => schema.make(id2 ?? "per_" + ascending()) })));
var Source = Schema16.Union([
  Schema16.Struct({
    type: Schema16.Literal("tool"),
    messageID: Schema16.String,
    id: Schema16.String
  })
]).annotate({ identifier: "Permission.Source" });
var RequestFields = {
  sessionID: SessionID,
  action: Schema16.String,
  resources: Schema16.Array(Schema16.String),
  save: Schema16.Array(Schema16.String).pipe(optional),
  metadata: Schema16.Record(Schema16.String, Schema16.Unknown).pipe(optional),
  source: Source.pipe(optional),
  message: Schema16.String.pipe(optional)
};
var Request2 = Schema16.Struct({
  id: ID7,
  ...RequestFields
}).annotate({ identifier: "Permission.Request" });
var Reply2 = Schema16.Literals(["once", "always", "reject"]).annotate({ identifier: "Permission.Reply" });
var Asked = ephemeral({ type: "permission.asked", schema: Request2.fields });
var Replied2 = ephemeral({
  type: "permission.replied",
  schema: {
    sessionID: SessionID,
    requestID: ID7,
    reply: Reply2
  }
});
var Event6 = { Asked, Replied: Replied2, Definitions: inventory(Asked, Replied2) };
var Effect2 = Schema16.Literals(["allow", "deny", "ask"]).annotate({ identifier: "Permission.Effect" });
var Rule = Schema16.Struct({
  action: Schema16.String,
  resource: Schema16.String,
  effect: Effect2
}).annotate({ identifier: "Permission.Rule" });
var Ruleset = Schema16.Array(Rule).annotate({ identifier: "Permission.Ruleset" });

// node_modules/@opencode/schema/dist/agent.js
var Updated5 = ephemeral({ type: "agent.updated", schema: {} });
var ID8 = Schema17.String.pipe(Schema17.brand("Agent.ID"), Schema17.annotate({ identifier: "Agent.ID" }));
var Name = Schema17.String.pipe(Schema17.brand("Agent.Name"));
var Color = Schema17.String.annotate({ identifier: "Agent.Color" });
var Info7 = Schema17.Struct({
  id: ID8,
  name: Name,
  model: model_exports.Ref.pipe(optional),
  request: provider_exports.Request,
  system: Schema17.String.pipe(optional),
  description: Schema17.String.pipe(optional),
  mode: Schema17.Literals(["subagent", "primary", "all"]),
  hidden: Schema17.Boolean,
  color: Color.pipe(optional),
  steps: PositiveInt.pipe(optional),
  permissions: permission_exports.Ruleset
}).annotate({ identifier: "Agent.Info" }).pipe(statics(() => ({
  default: (id2) => ({
    id: id2,
    name: Name.make(id2),
    request: { settings: {}, headers: {}, body: {} },
    mode: "primary",
    hidden: false,
    permissions: [
      { action: "*", resource: "*", effect: "allow" },
      { action: "read", resource: "*.env", effect: "ask" },
      { action: "read", resource: "*.env.*", effect: "ask" },
      { action: "read", resource: "*.env.example", effect: "allow" }
    ]
  })
})));
var Event7 = {
  Updated: Updated5,
  Definitions: inventory(Updated5)
};

// node_modules/@opencode/schema/dist/project.js
var project_exports = {};
__export(project_exports, {
  Commands: () => Commands,
  Current: () => Current,
  Event: () => Event8,
  ID: () => ID9,
  Icon: () => Icon,
  Info: () => Info8,
  Project: () => project_exports,
  Time: () => Time,
  UpdateInput: () => UpdateInput,
  Vcs: () => Vcs
});
import { Schema as Schema18 } from "effect";
var ID9 = ProjectID;
var Vcs = Schema18.String.check(Schema18.isPattern(/^[a-z][a-z0-9._-]*$/u)).annotate({
  identifier: "Project.Vcs"
});
var Current = Schema18.Struct({
  id: ID9,
  directory: AbsolutePath,
  canonical: AbsolutePath
}).annotate({ identifier: "Project.Current" });
var Icon = Schema18.Struct({
  url: optional(Schema18.String),
  override: optional(Schema18.String),
  color: optional(Schema18.String)
}).annotate({ identifier: "Project.Icon" });
var Commands = Schema18.Struct({
  start: optional(Schema18.String.annotate({ description: "Startup script to run when creating a new workspace (worktree)" }))
}).annotate({ identifier: "Project.Commands" });
var Time = Schema18.Struct({
  created: NonNegativeInt,
  updated: NonNegativeInt,
  active: NonNegativeInt,
  archived: optional(NonNegativeInt)
}).annotate({ identifier: "Project.Time" });
var Info8 = Schema18.Struct({
  id: ID9,
  canonical: AbsolutePath,
  vcs: optional(Vcs),
  name: optional(Schema18.String),
  icon: optional(Icon),
  commands: optional(Commands),
  time: Time,
  sandboxes: Schema18.Array(Schema18.String)
}).annotate({ identifier: "Project" });
var UpdateInput = Schema18.Struct({
  projectID: ID9,
  canonical: optional(AbsolutePath),
  name: optional(Schema18.String),
  icon: optional(Icon),
  commands: optional(Commands)
}).annotate({ identifier: "Project.UpdateInput" });
var Updated6 = ephemeral({ type: "project.updated", schema: Info8.fields });
var Event8 = { Updated: Updated6, Definitions: inventory(Updated6) };

// node_modules/@opencode/schema/dist/session-event.js
var session_event_exports = {};
__export(session_event_exports, {
  AgentSelected: () => AgentSelected2,
  All: () => All,
  Archived: () => Archived,
  Compaction: () => Compaction4,
  Created: () => Created3,
  Definitions: () => Definitions,
  Deleted: () => Deleted2,
  Durable: () => Durable,
  DurableDefinitions: () => DurableDefinitions,
  EphemeralDefinitions: () => EphemeralDefinitions,
  Execution: () => Execution,
  Forked: () => Forked,
  InboxCancelled: () => InboxCancelled,
  InboxDelivered: () => InboxDelivered,
  InboxDeliveryChanged: () => InboxDeliveryChanged,
  InboxEnqueued: () => InboxEnqueued,
  InstructionsUpdated: () => InstructionsUpdated,
  MessageContentUpdated: () => MessageContentUpdated,
  MetadataUpdated: () => MetadataUpdated,
  ModelSelected: () => ModelSelected2,
  Moved: () => Moved,
  Permissions: () => Permissions,
  Reasoning: () => Reasoning,
  Renamed: () => Renamed,
  RetryScheduled: () => RetryScheduled,
  RevertEvent: () => RevertEvent,
  SessionEvent: () => session_event_exports,
  Shell: () => Shell2,
  Skill: () => Skill2,
  Step: () => Step,
  Synthetic: () => Synthetic3,
  Text: () => Text,
  Tool: () => Tool,
  Unarchived: () => Unarchived,
  UsageRecorded: () => UsageRecorded,
  UsageUpdated: () => UsageUpdated,
  Viewed: () => Viewed
});
import { Schema as Schema35 } from "effect";

// node_modules/@opencode/schema/dist/llm.js
import { Schema as Schema19 } from "effect";
var FinishReason = Schema19.Literals(["stop", "length", "tool-calls", "content-filter", "error", "unknown"]);

// node_modules/@opencode/schema/dist/tool.js
var tool_exports = {};
__export(tool_exports, {
  CallID: () => CallID,
  Content: () => Content,
  Error: () => Error2,
  FileContent: () => FileContent,
  TextContent: () => TextContent,
  Tool: () => tool_exports
});
import { Effect as Effect3, JsonSchema, Schema as Schema20 } from "effect";
var CallID = Schema20.String.pipe(Schema20.brand("Tool.CallID"));
var Error2 = class extends Schema20.TaggedError()("Tool.Error", {
  message: Schema20.String,
  error: Schema20.optional(Schema20.Defect()),
  metadata: Schema20.optional(Schema20.Record(Schema20.String, Schema20.Unknown))
}) {
};
var TextContent = Schema20.Struct({
  type: Schema20.Literal("text"),
  text: Schema20.String
}).annotate({ identifier: "Tool.TextContent" });
var FileContent = Schema20.Struct({
  type: Schema20.Literal("file"),
  uri: Schema20.String,
  mime: Schema20.String,
  name: Schema20.optional(Schema20.String)
}).annotate({ identifier: "Tool.FileContent" });
var Content = Schema20.Union([TextContent, FileContent]).pipe(Schema20.toTaggedUnion("type")).annotate({ identifier: "Tool.Content" });

// node_modules/@opencode/schema/dist/session-metadata.js
import { Schema as Schema21 } from "effect";
var SessionMetadata = Schema21.Record(Schema21.String, Schema21.Json).annotate({
  identifier: "Session.Metadata"
});

// node_modules/@opencode/schema/dist/session-message.js
var session_message_exports = {};
__export(session_message_exports, {
  AgentSelected: () => AgentSelected,
  Assistant: () => Assistant,
  AssistantContent: () => AssistantContent,
  AssistantContentEncoded: () => AssistantContentEncoded,
  AssistantReasoning: () => AssistantReasoning,
  AssistantRetry: () => AssistantRetry,
  AssistantText: () => AssistantText,
  AssistantTool: () => AssistantTool,
  Compaction: () => Compaction2,
  CompactionCompleted: () => CompactionCompleted,
  CompactionFailed: () => CompactionFailed,
  CompactionRunning: () => CompactionRunning,
  ID: () => ID13,
  Idle: () => Idle,
  Info: () => Info12,
  LocationSwitched: () => LocationSwitched,
  MediaInfo: () => MediaInfo,
  MediaUser: () => MediaUser,
  ModelSelected: () => ModelSelected,
  Native: () => Native,
  SessionMessage: () => session_message_exports,
  Shell: () => Shell,
  Skill: () => Skill,
  Synthetic: () => Synthetic,
  System: () => System,
  ToolState: () => ToolState,
  ToolStateCompleted: () => ToolStateCompleted,
  ToolStateError: () => ToolStateError,
  ToolStateRunning: () => ToolStateRunning,
  ToolStateStreaming: () => ToolStateStreaming,
  User: () => User
});
import { Schema as Schema28 } from "effect";

// node_modules/@opencode/schema/dist/prompt.js
import { Schema as Schema23 } from "effect";

// node_modules/@opencode/schema/dist/skill.js
var skill_exports = {};
__export(skill_exports, {
  DirectorySource: () => DirectorySource,
  EmbeddedSource: () => EmbeddedSource,
  Event: () => Event9,
  ID: () => ID10,
  Info: () => Info9,
  Name: () => Name2,
  Skill: () => skill_exports,
  Source: () => Source2,
  UrlSource: () => UrlSource
});
import { Schema as Schema22 } from "effect";
var ID10 = Schema22.String.pipe(Schema22.brand("Skill.ID"), Schema22.annotate({ identifier: "Skill.ID" }));
var Name2 = Schema22.String.pipe(Schema22.brand("Skill.Name"), Schema22.annotate({ identifier: "Skill.Name" }));
var DirectorySource = Schema22.Struct({
  type: Schema22.tag("directory"),
  path: AbsolutePath
}).annotate({ identifier: "Skill.DirectorySource" });
var UrlSource = Schema22.Struct({
  type: Schema22.tag("url"),
  url: Schema22.String
}).annotate({ identifier: "Skill.UrlSource" });
var Info9 = Schema22.Struct({
  id: ID10,
  name: Name2,
  description: Schema22.String.pipe(optional),
  autoinvoke: Schema22.Boolean.pipe(optional),
  path: AbsolutePath,
  content: Schema22.String
}).annotate({ identifier: "Skill.Info" });
var Updated7 = ephemeral({ type: "skill.updated", schema: {} });
var Event9 = { Updated: Updated7, Definitions: inventory(Updated7) };
var EmbeddedSource = Schema22.Struct({
  type: Schema22.tag("embedded"),
  skill: Schema22.suspend(() => Info9)
}).annotate({ identifier: "Skill.EmbeddedSource" });
var Source2 = Object.assign(Schema22.Union([DirectorySource, UrlSource, EmbeddedSource]).pipe(Schema22.toTaggedUnion("type"), Schema22.annotate({ identifier: "Skill.Source" })), {
  equals: (a, b) => {
    if (a.type !== b.type)
      return false;
    if (a.type === "directory" && b.type === "directory")
      return a.path === b.path;
    if (a.type === "url" && b.type === "url")
      return a.url === b.url;
    if (a.type === "embedded" && b.type === "embedded")
      return a.skill.id === b.skill.id;
    return false;
  },
  key: (source) => source.type === "directory" ? `directory:${source.path}` : source.type === "url" ? `url:${source.url}` : `embedded:${source.skill.id}`
});

// node_modules/@opencode/schema/dist/prompt.js
var PromptMention = Schema23.Struct({
  start: Schema23.Finite,
  end: Schema23.Finite,
  text: Schema23.String
}).annotate({ identifier: "Prompt.Mention" });
var FileSource = Schema23.Union([
  Schema23.Struct({ type: Schema23.Literal("inline") }),
  Schema23.Struct({ type: Schema23.Literal("uri"), uri: Schema23.String })
]).pipe(Schema23.toTaggedUnion("type")).annotate({ identifier: "Prompt.FileSource" });
var Base64 = Schema23.String.check(Schema23.makeFilter((value) => value.length % 4 === 0 && /^[A-Za-z0-9+/]*={0,2}$/u.test(value), Schema23.isPattern(/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/u).annotations)).annotate({ identifier: "Prompt.Base64" });
var FileAttachment = Schema23.Struct({
  data: Base64,
  mime: Schema23.String,
  source: FileSource,
  name: Schema23.String.pipe(optional),
  description: Schema23.String.pipe(optional),
  mention: PromptMention.pipe(optional)
}).annotate({ identifier: "Prompt.FileAttachment" }).pipe(statics((schema) => ({
  create: (input) => schema.make({
    data: input.data,
    mime: input.mime,
    source: input.source,
    name: input.name,
    description: input.description,
    mention: input.mention
  })
})));
var MediaRef = Schema23.String.check(Schema23.isPattern(/^media:[0-9a-f]{64}$/)).annotate({
  identifier: "Prompt.MediaRef"
});
var { data: _, ...fileAttachmentFields } = FileAttachment.fields;
var MediaFileAttachment = Schema23.Struct({
  ...fileAttachmentFields,
  uri: MediaRef,
  bytes: Schema23.Int.pipe(optional),
  width: Schema23.Int.pipe(optional),
  height: Schema23.Int.pipe(optional)
}).annotate({ identifier: "Prompt.MediaFileAttachment" });
var Attachment = Schema23.Union([FileAttachment, MediaFileAttachment]).annotate({
  identifier: "Prompt.Attachment"
});
var AgentAttachment = Schema23.Struct({
  name: Schema23.String,
  mention: PromptMention.pipe(optional)
}).annotate({ identifier: "Prompt.AgentAttachment" });
var SkillAttachment = Schema23.Struct({
  id: skill_exports.ID,
  name: skill_exports.Name,
  text: Schema23.String.pipe(optional),
  mention: PromptMention.pipe(optional)
}).annotate({ identifier: "Prompt.SkillAttachment" });
var Prompt = Schema23.Struct({
  text: Schema23.String,
  files: Schema23.Array(FileAttachment).pipe(optional),
  agents: Schema23.Array(AgentAttachment).pipe(optional),
  skills: Schema23.Array(SkillAttachment).pipe(optional)
}).annotate({ identifier: "Prompt" }).pipe(statics((schema) => ({
  equivalence: Schema23.toEquivalence(schema),
  fromUserMessage: (input) => schema.make({
    text: input.text,
    ...input.files === void 0 ? {} : { files: input.files },
    ...input.agents === void 0 ? {} : { agents: input.agents },
    ...input.skills === void 0 ? {} : { skills: input.skills }
  })
})));

// node_modules/@opencode/schema/dist/shell.js
var shell_exports = {};
__export(shell_exports, {
  CreateInput: () => CreateInput2,
  Event: () => Event10,
  ID: () => ID11,
  Info: () => Info10,
  Metadata: () => Metadata2,
  Output: () => Output,
  OutputInput: () => OutputInput,
  Shell: () => shell_exports,
  Status: () => Status2,
  Time: () => Time2
});
import { Schema as Schema24 } from "effect";
var IDSchema2 = Schema24.String.check(Schema24.isStartingWith("sh_")).pipe(Schema24.brand("Shell.ID"), Schema24.annotate({ identifier: "Shell.ID" }));
var ID11 = IDSchema2.pipe(statics((schema) => {
  const create2 = () => schema.make("sh_" + ascending());
  return {
    create: create2,
    ascending: (id2) => id2 === void 0 ? create2() : schema.make(id2)
  };
}));
var Status2 = Schema24.Literals(["running", "exited", "timeout", "killed"]);
var Time2 = Schema24.Struct({
  started: Schema24.Finite.annotate({ description: "Start time in milliseconds since the Unix epoch" }),
  completed: optional(Schema24.Finite).annotate({
    description: "Completion time in milliseconds since the Unix epoch"
  })
});
var Metadata2 = Schema24.Record(Schema24.String, Schema24.Unknown);
var Info10 = Schema24.Struct({
  id: ID11,
  status: Status2,
  command: Schema24.String,
  cwd: Schema24.String,
  shell: Schema24.String,
  // Absolute path of the file capturing combined stdout/stderr. Page through it via `output`.
  file: Schema24.String,
  pid: optional(NonNegativeInt),
  exit: optional(Schema24.Finite),
  signal: optional(Schema24.String),
  // Always present; defaults to an empty object when the creator supplies no metadata.
  metadata: Metadata2,
  time: Time2
}).annotate({ identifier: "Shell.Info" });
var Created2 = ephemeral({ type: "shell.created", schema: { info: Info10 } });
var Exited = ephemeral({ type: "shell.exited", schema: { id: ID11, exit: optional(Schema24.Finite), status: Status2 } });
var Deleted = ephemeral({ type: "shell.deleted", schema: { id: ID11 } });
var Event10 = { Created: Created2, Exited, Deleted, Definitions: inventory(Created2, Exited, Deleted) };
var CreateInput2 = Schema24.Struct({
  command: Schema24.String,
  cwd: optional(Schema24.String),
  timeout: optional(NonNegativeInt),
  metadata: optional(Metadata2)
});
var OutputInput = Schema24.Struct({
  cursor: optional(NonNegativeInt),
  limit: optional(NonNegativeInt)
});
var Output = Schema24.Struct({
  output: Schema24.String,
  // Absolute cursor after this page. Equals `size` once fully caught up.
  cursor: NonNegativeInt,
  // Total bytes captured so far. A consumer has more to page while `cursor < size`.
  size: NonNegativeInt,
  truncated: Schema24.Boolean
});

// node_modules/@opencode/schema/dist/session-error.js
var session_error_exports = {};
__export(session_error_exports, {
  Error: () => Error3,
  SessionError: () => session_error_exports
});
import { Schema as Schema25 } from "effect";
var Error3 = Schema25.Struct({
  type: Schema25.String,
  message: Schema25.String,
  status: Schema25.Int.check(Schema25.isBetween({ minimum: 100, maximum: 599 })).pipe(optional),
  response: Schema25.Struct({ body: Schema25.String }).pipe(optional),
  /** How long the provider asked to wait before trying again, counted from when the failure was recorded. */
  retryAfterMs: NonNegativeInt.pipe(optional)
}).annotate({ identifier: "Session.StructuredError" });

// node_modules/@opencode/schema/dist/snapshot.js
var snapshot_exports = {};
__export(snapshot_exports, {
  ID: () => ID12,
  Snapshot: () => snapshot_exports
});
import { Schema as Schema26 } from "effect";
var ID12 = Schema26.String.pipe(Schema26.brand("Snapshot.ID"), Schema26.annotate({ identifier: "Snapshot.ID" }));

// node_modules/@opencode/schema/dist/token-usage.js
var token_usage_exports = {};
__export(token_usage_exports, {
  Info: () => Info11,
  TokenUsage: () => token_usage_exports,
  total: () => total
});
import { Schema as Schema27 } from "effect";
var Info11 = Schema27.Struct({
  input: Schema27.Finite,
  output: Schema27.Finite,
  reasoning: Schema27.Finite,
  cache: Schema27.Struct({
    read: Schema27.Finite,
    write: Schema27.Finite
  })
}).annotate({ identifier: "TokenUsage.Info" });
function total(tokens) {
  return tokens.input + tokens.output + tokens.reasoning + tokens.cache.read + tokens.cache.write;
}

// node_modules/@opencode/schema/dist/session-message.js
var ID13 = Schema28.String.check(Schema28.isStartingWith("msg_")).pipe(Schema28.brand("Session.Message.ID"), Schema28.annotate({ identifier: "Session.Message.ID" }), statics((schema) => ({
  create: () => schema.make("msg_" + ascending()),
  fromEvent: (eventID) => schema.make(eventID.replace(/^evt_/, "msg_"))
})));
var Base = {
  id: ID13,
  metadata: Schema28.Record(Schema28.String, Schema28.Unknown).pipe(optional),
  time: Schema28.Struct({ created: DateTimeUtcFromMillis })
};
var Native = Schema28.Record(Schema28.String, Schema28.Unknown).annotate({
  identifier: "Session.Message.Native"
});
var AgentSelected = Schema28.Struct({
  ...Base,
  type: Schema28.tag("agent-switched"),
  agent: agent_exports.ID,
  previous: agent_exports.ID.pipe(optional)
}).annotate({ identifier: "Session.Message.AgentSelected" });
var ModelSelected = Schema28.Struct({
  ...Base,
  type: Schema28.tag("model-switched"),
  model: model_exports.Ref,
  previous: model_exports.Ref.pipe(optional)
}).annotate({ identifier: "Session.Message.ModelSelected" });
var LocationSwitched = Schema28.Struct({
  ...Base,
  type: Schema28.tag("location-switched"),
  location: location_exports.Ref,
  projectID: project_exports.ID.pipe(optional),
  subpath: RelativePath.pipe(optional),
  previous: Schema28.Struct({
    location: location_exports.Ref,
    projectID: project_exports.ID.pipe(optional),
    subpath: RelativePath.pipe(optional)
  }).pipe(optional)
}).annotate({ identifier: "Session.Message.LocationSwitched" });
var User = Schema28.Struct({
  ...Base,
  text: Prompt.fields.text,
  files: Prompt.fields.files,
  agents: Prompt.fields.agents,
  skills: Prompt.fields.skills,
  type: Schema28.tag("user")
}).annotate({ identifier: "Session.Message.User" });
var MediaUser = Schema28.Struct({
  ...User.fields,
  files: Schema28.Array(Attachment).pipe(optional)
}).annotate({ identifier: "Session.Message.MediaUser" });
var Synthetic = Schema28.Struct({
  ...Base,
  text: Schema28.String,
  description: Schema28.String.pipe(optional),
  type: Schema28.tag("synthetic")
}).annotate({ identifier: "Session.Message.Synthetic" });
var System = Schema28.Struct({
  ...Base,
  type: Schema28.tag("system"),
  /** The model-facing update text, frozen at emit time. */
  text: Schema28.String,
  /** A short human-readable summary for transcript display. */
  description: Schema28.String.pipe(optional)
}).annotate({ identifier: "Session.Message.System" });
var Skill = Schema28.Struct({
  ...Base,
  type: Schema28.tag("skill"),
  skill: skill_exports.ID,
  name: skill_exports.Name,
  text: Schema28.String
}).annotate({ identifier: "Session.Message.Skill" });
var Shell = Schema28.Struct({
  ...Base,
  type: Schema28.tag("shell"),
  shellID: shell_exports.ID,
  command: Schema28.String,
  status: shell_exports.Status,
  exit: Schema28.Number.pipe(optional),
  output: shell_exports.Output.pipe(optional),
  time: Schema28.Struct({
    created: DateTimeUtcFromMillis,
    completed: DateTimeUtcFromMillis.pipe(optional)
  })
}).annotate({ identifier: "Session.Message.Shell" });
var ToolStateStreaming = Schema28.Struct({
  status: Schema28.tag("streaming"),
  input: Schema28.String
}).annotate({ identifier: "Session.Message.ToolState.Streaming" });
var ToolStateRunning = Schema28.Struct({
  status: Schema28.tag("running"),
  input: Schema28.Record(Schema28.String, Schema28.Unknown),
  metadata: Schema28.Record(Schema28.String, Schema28.Json)
}).annotate({ identifier: "Session.Message.ToolState.Running" });
var ToolStateCompleted = Schema28.Struct({
  status: Schema28.tag("completed"),
  input: Schema28.Record(Schema28.String, Schema28.Unknown),
  content: Schema28.NonEmptyArray(Content),
  metadata: Schema28.Record(Schema28.String, Schema28.Json).pipe(optional)
}).annotate({ identifier: "Session.Message.ToolState.Completed" });
var ToolStateError = Schema28.Struct({
  status: Schema28.tag("error"),
  input: Schema28.Record(Schema28.String, Schema28.Unknown),
  error: session_error_exports.Error,
  content: Schema28.NonEmptyArray(Content).pipe(optional),
  metadata: Schema28.Record(Schema28.String, Schema28.Json).pipe(optional)
}).annotate({ identifier: "Session.Message.ToolState.Error" });
var ToolState = Schema28.Union([ToolStateStreaming, ToolStateRunning, ToolStateCompleted, ToolStateError]).pipe(Schema28.toTaggedUnion("status"));
var AssistantTool = Schema28.Struct({
  type: Schema28.tag("tool"),
  id: Schema28.String,
  name: Schema28.String,
  executed: Schema28.Boolean.pipe(optional),
  native: Native.pipe(optional),
  state: ToolState,
  time: Schema28.Struct({
    created: DateTimeUtcFromMillis,
    ran: DateTimeUtcFromMillis.pipe(optional),
    completed: DateTimeUtcFromMillis.pipe(optional)
  })
}).annotate({ identifier: "Session.Message.Assistant.Tool" });
var AssistantText = Schema28.Struct({
  type: Schema28.tag("text"),
  text: Schema28.String,
  native: Native.pipe(optional)
}).annotate({ identifier: "Session.Message.Assistant.Text" });
var AssistantReasoning = Schema28.Struct({
  type: Schema28.tag("reasoning"),
  text: Schema28.String,
  native: Native.pipe(optional),
  time: Schema28.Struct({
    created: DateTimeUtcFromMillis,
    completed: DateTimeUtcFromMillis.pipe(optional)
  }).pipe(optional)
}).annotate({ identifier: "Session.Message.Assistant.Reasoning" });
var AssistantContent = Schema28.Union([AssistantText, AssistantReasoning, AssistantTool]).pipe(Schema28.toTaggedUnion("type"));
var AssistantContentEncoded = Schema28.toEncoded(AssistantContent).annotate({
  identifier: "Session.Message.AssistantContent.Encoded"
});
var AssistantRetry = Schema28.Struct({
  attempt: PositiveInt,
  at: DateTimeUtcFromMillis,
  error: session_error_exports.Error
}).annotate({ identifier: "Session.Message.Assistant.Retry" });
var Assistant = Schema28.Struct({
  ...Base,
  type: Schema28.tag("assistant"),
  agent: agent_exports.ID,
  model: model_exports.Ref,
  content: AssistantContent.pipe(Schema28.Array),
  snapshot: Schema28.Struct({
    start: snapshot_exports.ID.pipe(optional),
    end: snapshot_exports.ID.pipe(optional),
    files: Schema28.Array(RelativePath).pipe(optional)
  }).pipe(optional),
  finish: FinishReason.pipe(optional),
  rawFinish: Schema28.String.pipe(optional),
  /** Step-level native data, such as a provider's reason for blocking a response. */
  native: Native.pipe(optional),
  cost: money_exports.USD.pipe(optional),
  tokens: token_usage_exports.Info.pipe(optional),
  error: session_error_exports.Error.pipe(optional),
  retry: AssistantRetry.pipe(optional),
  time: Schema28.Struct({
    created: DateTimeUtcFromMillis,
    /** When the provider response body ended, before tool settlement. */
    streamed: DateTimeUtcFromMillis.pipe(optional),
    completed: DateTimeUtcFromMillis.pipe(optional)
  })
}).annotate({ identifier: "Session.Message.Assistant" });
var CompactionBase = { type: Schema28.tag("compaction"), ...Base };
var CompactionUsage = {
  cost: money_exports.USD.pipe(optional),
  tokens: token_usage_exports.Info.pipe(optional)
};
var CompactionRunning = Schema28.Struct({
  ...CompactionBase,
  status: Schema28.tag("running"),
  reason: Schema28.Literals(["auto", "manual"]),
  summary: Schema28.String
}).annotate({ identifier: "Session.Message.Compaction.Running" });
var CompactionCompleted = Schema28.Struct({
  ...CompactionBase,
  status: Schema28.tag("completed"),
  reason: Schema28.Literals(["auto", "manual"]),
  model: model_exports.Ref.pipe(optional),
  /** A provider compaction stores its replacement window in `native.messages`, replayed instead of `summary`. */
  native: Native.pipe(optional),
  summary: Schema28.String,
  ...CompactionUsage
}).annotate({ identifier: "Session.Message.Compaction.Completed" });
var CompactionFailed = Schema28.Struct({
  ...CompactionBase,
  status: Schema28.tag("failed"),
  reason: Schema28.Literals(["auto", "manual"]),
  error: session_error_exports.Error,
  ...CompactionUsage
}).annotate({ identifier: "Session.Message.Compaction.Failed" });
var Compaction2 = Schema28.Union([CompactionRunning, CompactionCompleted, CompactionFailed]).pipe(Schema28.toTaggedUnion("status"), Schema28.annotate({ identifier: "Session.Message.Compaction" }));
var Idle = Schema28.Struct({
  ...Base,
  type: Schema28.tag("idle"),
  outcome: Schema28.Literals(["succeeded", "failed", "interrupted"]),
  error: session_error_exports.Error.pipe(optional)
}).annotate({ identifier: "Session.Message.Idle" });
var Info12 = Schema28.Union([
  AgentSelected,
  ModelSelected,
  LocationSwitched,
  User,
  Synthetic,
  System,
  Skill,
  Shell,
  Assistant,
  Compaction2,
  Idle
]).annotate({ identifier: "Session.Message.Info" });
var MediaInfo = Schema28.Union([
  AgentSelected,
  ModelSelected,
  LocationSwitched,
  MediaUser,
  Synthetic,
  System,
  Skill,
  Shell,
  Assistant,
  Compaction2,
  Idle
]).annotate({ identifier: "Session.Message.MediaInfo" });

// node_modules/@opencode/schema/dist/session-revert.js
import { Schema as Schema30, SchemaTransformation as SchemaTransformation2 } from "effect";

// node_modules/@opencode/schema/dist/file-diff.js
var file_diff_exports = {};
__export(file_diff_exports, {
  FileDiff: () => file_diff_exports,
  Info: () => Info13,
  LegacyInfo: () => LegacyInfo
});
import { Schema as Schema29 } from "effect";
var Info13 = Schema29.Struct({
  file: Schema29.String,
  patch: Schema29.String,
  additions: NonNegativeInt,
  deletions: NonNegativeInt,
  status: Schema29.Literals(["added", "deleted", "modified"]),
  /** Marks the entry a folder listing adds for itself when it stopped before showing or checking every entry. */
  more: Schema29.Literal(true).pipe(optional)
}).annotate({ identifier: "FileDiff.Info" });
var LegacyInfo = Schema29.Struct({
  file: Schema29.String.pipe(optional),
  patch: Schema29.String.pipe(optional),
  additions: Schema29.Finite,
  deletions: Schema29.Finite,
  status: Schema29.Literals(["added", "deleted", "modified"]).pipe(optional)
}).annotate({ identifier: "FileDiff.LegacyInfo" });

// node_modules/@opencode/schema/dist/session-revert.js
var Revert = Schema30.Struct({
  messageID: session_message_exports.ID,
  /** Legacy V1 compatibility state. */
  partID: Schema30.String.pipe(optional),
  snapshot: snapshot_exports.ID.pipe(optional),
  files: Schema30.Array(file_diff_exports.Info).pipe(optional)
}).annotate({ identifier: "Session.Revert" });
var FileDiffV1 = Schema30.Struct({
  path: Schema30.String,
  status: Schema30.Literals(["added", "modified", "deleted"]),
  additions: Schema30.Finite,
  deletions: Schema30.Finite,
  patch: Schema30.String
});
var RevertV1 = Schema30.Struct({
  messageID: session_message_exports.ID,
  partID: Schema30.String.pipe(optional),
  snapshot: Schema30.String.pipe(optional),
  diff: Schema30.String.pipe(optional),
  files: Schema30.Array(FileDiffV1).pipe(optional)
}).annotate({ identifier: "Session.RevertV1" });
var PersistedCurrent = Revert.pipe(Schema30.decodeTo(Schema30.Struct({ source: Schema30.tag("current"), revert: Schema30.toType(Revert) }), SchemaTransformation2.transform({
  decode: (revert) => ({
    source: "current",
    revert
  }),
  encode: (value) => value.revert
})));
var PersistedLegacy = RevertV1.pipe(Schema30.decodeTo(Schema30.Struct({ source: Schema30.tag("legacy"), revert: Schema30.toType(RevertV1) }), SchemaTransformation2.transform({
  decode: (revert) => ({
    source: "legacy",
    revert
  }),
  encode: (value) => value.revert
})));
var PersistedRevert = Schema30.Union([PersistedCurrent, PersistedLegacy]).pipe(Schema30.toTaggedUnion("source"), Schema30.decodeTo(Schema30.toType(Revert), SchemaTransformation2.transform({
  decode: (persisted) => {
    if (persisted.source === "current")
      return persisted.revert;
    return Revert.make({
      messageID: persisted.revert.messageID,
      partID: persisted.revert.partID,
      snapshot: persisted.revert.snapshot ? snapshot_exports.ID.make(persisted.revert.snapshot) : void 0,
      files: persisted.revert.files?.map((file) => ({
        file: file.path,
        status: file.status,
        additions: file.additions,
        deletions: file.deletions,
        patch: file.patch
      }))
    });
  },
  encode: (revert) => ({
    source: "current",
    revert
  })
})), Schema30.annotate({ identifier: "Session.Revert.Persisted" }));

// node_modules/@opencode/schema/dist/instruction.js
var instruction_exports = {};
__export(instruction_exports, {
  Delta: () => Delta,
  Hash: () => Hash,
  Instruction: () => instruction_exports,
  Key: () => Key2,
  Removed: () => Removed,
  Values: () => Values,
  removed: () => removed
});
import { Schema as Schema31 } from "effect";
var Key2 = Schema31.String.check(Schema31.isPattern(/^[a-z0-9][a-z0-9._-]*\/[a-z0-9][a-z0-9._/-]*$/u)).pipe(Schema31.brand("Instruction.Key"), Schema31.annotate({ identifier: "Instruction.Key" }));
var Hash = Schema31.String.check(Schema31.isPattern(/^[a-f0-9]{64}$/u)).pipe(Schema31.brand("Instruction.Hash"), Schema31.annotate({ identifier: "Instruction.Hash" }));
var Values = Schema31.Record(Key2, Hash);
var Removed = Schema31.Literal("removed");
var removed = Removed.make("removed");
var Delta = Schema31.Record(Schema31.String, Schema31.Union([Hash, Removed]));

// node_modules/@opencode/schema/dist/instruction-entry.js
var instruction_entry_exports = {};
__export(instruction_entry_exports, {
  Info: () => Info14,
  InstructionEntry: () => instruction_entry_exports,
  Key: () => Key3,
  MaxValueBytes: () => MaxValueBytes,
  Snapshot: () => Snapshot,
  ValueTooLargeError: () => ValueTooLargeError
});
import { Schema as Schema32 } from "effect";
var Key3 = Schema32.String.check(Schema32.isPattern(/^[a-z0-9][a-z0-9._-]*$/u)).annotate({
  identifier: "InstructionEntry.Key",
  description: "Instruction entry key (lowercase alphanumerics plus . _ -)"
});
var Info14 = Schema32.Struct({
  key: Key3,
  value: Schema32.Json.annotate({ description: "JSON value attached to the session's instructions" })
}).annotate({ identifier: "InstructionEntry.Info" });
var Snapshot = Schema32.Array(Schema32.Struct({
  ...Info14.fields,
  removed: Schema32.Boolean
})).annotate({ identifier: "InstructionEntry.Snapshot" });
var MaxValueBytes = 256 * 1024;
var ValueTooLargeError = class extends Schema32.TaggedError()("InstructionEntryValueTooLargeError", {
  actualBytes: Schema32.Int,
  maxBytes: Schema32.Int,
  message: Schema32.String
}, { httpApiStatus: 413 }) {
};

// node_modules/@opencode/schema/dist/session-inbox.js
var session_inbox_exports = {};
__export(session_inbox_exports, {
  Compaction: () => Compaction3,
  CompactionPayload: () => CompactionPayload,
  Delivery: () => Delivery,
  Info: () => Info15,
  Item: () => Item,
  MediaInfo: () => MediaInfo2,
  MediaUser: () => MediaUser2,
  MediaUserPayload: () => MediaUserPayload,
  Move: () => Move,
  MovePayload: () => MovePayload,
  SessionInbox: () => session_inbox_exports,
  Synthetic: () => Synthetic2,
  SyntheticPayload: () => SyntheticPayload,
  User: () => User2,
  UserPayload: () => UserPayload
});
import { Schema as Schema33 } from "effect";
var Delivery = Schema33.Literals(["steer", "queue"]).annotate({ identifier: "Session.Inbox.Delivery" });
var UserPayload = Schema33.Struct({
  ...Prompt.fields,
  metadata: Schema33.Record(Schema33.String, Schema33.Unknown).pipe(optional)
}).annotate({ identifier: "Session.Inbox.UserPayload" });
var MediaUserPayload = Schema33.Struct({
  ...UserPayload.fields,
  files: Schema33.Array(Attachment).pipe(optional)
}).annotate({ identifier: "Session.Inbox.MediaUserPayload" });
var SyntheticPayload = Schema33.Struct({
  text: Schema33.String,
  description: Schema33.String.pipe(optional),
  metadata: Schema33.Record(Schema33.String, Schema33.Unknown).pipe(optional)
}).annotate({ identifier: "Session.Inbox.SyntheticPayload" });
var CompactionPayload = Schema33.Struct({}).annotate({ identifier: "Session.Inbox.CompactionPayload" });
var MovePayload = Schema33.Struct({
  location: location_exports.Ref,
  projectID: project_exports.ID,
  subpath: RelativePath.pipe(optional)
}).annotate({ identifier: "Session.Inbox.MovePayload" });
var UserItem = Schema33.Struct({ type: Schema33.tag("user"), payload: UserPayload, delivery: Delivery });
var SyntheticItem = Schema33.Struct({ type: Schema33.tag("synthetic"), payload: SyntheticPayload, delivery: Delivery });
var CompactionItem = Schema33.Struct({
  type: Schema33.tag("compaction"),
  payload: CompactionPayload,
  delivery: Delivery
});
var MoveItem = Schema33.Struct({ type: Schema33.tag("move"), payload: MovePayload, delivery: Delivery });
var Item = Schema33.Union([UserItem, SyntheticItem, CompactionItem, MoveItem]).pipe(Schema33.toTaggedUnion("type"), Schema33.annotate({ identifier: "Session.Inbox.Item" }));
var Enqueued = {
  id: session_message_exports.ID,
  sessionID: SessionID,
  time: Schema33.Struct({ created: DateTimeUtcFromMillis })
};
var User2 = Schema33.Struct({ ...Enqueued, ...UserItem.fields }).annotate({ identifier: "Session.Inbox.User" });
var MediaUser2 = Schema33.Struct({ ...User2.fields, payload: MediaUserPayload }).annotate({
  identifier: "Session.Inbox.MediaUser"
});
var Synthetic2 = Schema33.Struct({ ...Enqueued, ...SyntheticItem.fields }).annotate({
  identifier: "Session.Inbox.Synthetic"
});
var Compaction3 = Schema33.Struct({ ...Enqueued, ...CompactionItem.fields }).annotate({
  identifier: "Session.Inbox.Compaction"
});
var Move = Schema33.Struct({ ...Enqueued, ...MoveItem.fields }).annotate({ identifier: "Session.Inbox.Move" });
var Info15 = Schema33.Union([User2, Synthetic2, Compaction3, Move]).pipe(Schema33.toTaggedUnion("type"), Schema33.annotate({ identifier: "Session.Inbox.Info" }));
var MediaInfo2 = Schema33.Union([MediaUser2, Synthetic2, Compaction3, Move]).pipe(Schema33.toTaggedUnion("type"), Schema33.annotate({ identifier: "Session.Inbox.MediaInfo" }));

// node_modules/@opencode/schema/dist/session-fork.js
var session_fork_exports = {};
__export(session_fork_exports, {
  Boundary: () => Boundary,
  SessionFork: () => session_fork_exports
});
import { Schema as Schema34 } from "effect";
var Boundary = Schema34.Union([
  Schema34.Struct({ type: Schema34.Literal("before"), messageID: session_message_exports.ID }),
  Schema34.Struct({ type: Schema34.Literal("through"), messageID: session_message_exports.ID })
]).annotate({ identifier: "Session.ForkBoundary" });

// node_modules/@opencode/schema/dist/session-event.js
var Base2 = {
  sessionID: SessionID
};
var options = {
  durable: {
    aggregate: "sessionID",
    version: 1
  }
};
var Created3 = event_exports.durable({
  type: "session.created",
  ...options,
  schema: {
    ...Base2,
    projectID: project_exports.ID,
    location: location_exports.Ref,
    subpath: RelativePath.pipe(optional),
    parentID: SessionID.pipe(optional),
    slug: Schema35.String,
    title: Schema35.String.pipe(optional),
    agent: agent_exports.ID.pipe(optional),
    model: model_exports.Ref.pipe(optional),
    /** Host-supplied annotations resolved at creation, including any inherited from a parent. */
    metadata: SessionMetadata.pipe(optional),
    permissions: permission_exports.Ruleset.pipe(optional),
    version: Schema35.String
  }
});
var AgentSelected2 = event_exports.durable({
  type: "session.agent.selected",
  ...options,
  schema: {
    ...Base2,
    agent: agent_exports.ID,
    previous: agent_exports.ID.pipe(optional)
  }
});
var ModelSelected2 = event_exports.durable({
  type: "session.model.selected",
  ...options,
  schema: {
    ...Base2,
    model: model_exports.Ref,
    previous: model_exports.Ref.pipe(optional)
  }
});
var Moved = event_exports.durable({
  type: "session.moved",
  ...options,
  schema: {
    ...Base2,
    ...session_inbox_exports.MovePayload.fields
  }
});
var Renamed = event_exports.durable({
  type: "session.renamed",
  ...options,
  schema: {
    ...Base2,
    title: Schema35.String
  }
});
var MetadataUpdated = event_exports.durable({
  type: "session.metadata.updated",
  ...options,
  schema: {
    ...Base2,
    metadata: SessionMetadata
  }
});
var Permissions = event_exports.durable({
  type: "session.permissions",
  ...options,
  schema: {
    ...Base2,
    permissions: permission_exports.Ruleset
  }
});
var Viewed = event_exports.durable({
  type: "session.viewed",
  ...options,
  schema: {
    ...Base2,
    /** Epoch-millisecond idle watermark the viewer observed; projection never marks a newer idle transition viewed. */
    idle: Schema35.Finite
  }
});
var Archived = event_exports.durable({
  type: "session.archived",
  ...options,
  schema: Base2
});
var Unarchived = event_exports.durable({
  type: "session.unarchived",
  ...options,
  schema: Base2
});
var MessageContentUpdated = event_exports.durable({
  type: "session.message.content.updated",
  ...options,
  schema: {
    ...Base2,
    messageID: session_message_exports.ID,
    // Public events are framed directly, so timestamps must already be encoded.
    content: Schema35.Array(session_message_exports.AssistantContentEncoded)
  }
});
var UsageRecorded = event_exports.durable({
  type: "session.usage.recorded",
  ...options,
  schema: {
    ...Base2,
    source: Schema35.Literals(["title", "compaction"]),
    cost: money_exports.USD,
    tokens: token_usage_exports.Info
  }
});
var UsageUpdated = event_exports.ephemeral({
  type: "session.usage.updated",
  schema: {
    ...Base2,
    cost: money_exports.USD,
    tokens: token_usage_exports.Info
  }
});
var Deleted2 = event_exports.durable({
  type: "session.deleted",
  durable: {
    aggregate: "sessionID",
    version: 2
  },
  schema: Base2
});
var Forked = event_exports.durable({
  type: "session.forked",
  durable: {
    aggregate: "sessionID",
    version: 2
  },
  schema: {
    ...Base2,
    parentID: SessionID,
    boundary: session_fork_exports.Boundary,
    instructions: instruction_exports.Values.pipe(optional),
    instructionEntries: instruction_entry_exports.Snapshot.pipe(optional)
  }
});
var InboxRef = {
  ...Base2,
  inboxID: session_message_exports.ID
};
var InboxDelivered = event_exports.durable({
  type: "session.inbox.delivered",
  ...options,
  schema: InboxRef
});
var InboxEnqueued = event_exports.durable({
  type: "session.inbox.enqueued",
  ...options,
  schema: {
    ...InboxRef,
    item: session_inbox_exports.Item
  }
});
var InboxCancelled = event_exports.durable({
  type: "session.inbox.cancelled",
  ...options,
  schema: InboxRef
});
var InboxDeliveryChanged = event_exports.durable({
  type: "session.inbox.delivery.changed",
  ...options,
  schema: { ...InboxRef, delivery: session_inbox_exports.Delivery }
});
var Execution;
(function(Execution2) {
  Execution2.Started = event_exports.durable({ type: "session.execution.started", ...options, schema: Base2 });
  Execution2.Succeeded = event_exports.durable({ type: "session.execution.succeeded", ...options, schema: Base2 });
  Execution2.Failed = event_exports.durable({
    type: "session.execution.failed",
    ...options,
    schema: { ...Base2, error: session_error_exports.Error }
  });
  Execution2.Interrupted = event_exports.durable({
    type: "session.execution.interrupted",
    ...options,
    schema: { ...Base2, reason: Schema35.Literals(["user", "shutdown", "superseded", "inactivity"]) }
  });
})(Execution || (Execution = {}));
var InstructionsUpdated = event_exports.durable({
  type: "session.instructions.updated",
  durable: {
    aggregate: "sessionID",
    version: 2
  },
  schema: {
    ...Base2,
    delta: instruction_exports.Delta,
    /**
     * The rendered chronological update shown to the model, frozen at emit time.
     * Absent for the initial baseline observation and for deltas that render empty.
     */
    text: Schema35.String.pipe(optional)
  }
});
var Synthetic3 = event_exports.durable({
  type: "session.synthetic",
  ...options,
  schema: {
    ...Base2,
    text: Schema35.String,
    description: Schema35.String.pipe(optional),
    metadata: Schema35.Record(Schema35.String, Schema35.Unknown).pipe(optional)
  }
});
var Skill2;
(function(Skill3) {
  Skill3.Activated = event_exports.durable({
    type: "session.skill.activated",
    ...options,
    schema: {
      ...Base2,
      id: skill_exports.ID,
      name: skill_exports.Name,
      text: Schema35.String
    }
  });
})(Skill2 || (Skill2 = {}));
var Shell2;
(function(Shell3) {
  Shell3.Started = event_exports.durable({
    type: "session.shell.started",
    ...options,
    schema: {
      ...Base2,
      shell: shell_exports.Info
    }
  });
  Shell3.Ended = event_exports.durable({
    type: "session.shell.ended",
    ...options,
    schema: {
      ...Base2,
      shell: shell_exports.Info,
      output: shell_exports.Output
    }
  });
})(Shell2 || (Shell2 = {}));
var Step;
(function(Step2) {
  Step2.Started = event_exports.durable({
    type: "session.step.started",
    ...options,
    schema: {
      ...Base2,
      assistantMessageID: session_message_exports.ID,
      agent: agent_exports.ID,
      model: model_exports.Ref,
      snapshot: snapshot_exports.ID.pipe(optional),
      /** Request dispatch time, before waiting for provider output. */
      started: NonNegativeInt
    }
  });
  Step2.Streamed = event_exports.durable({
    type: "session.step.streamed",
    ...options,
    schema: {
      ...Base2,
      assistantMessageID: session_message_exports.ID
    }
  });
  Step2.Ended = event_exports.durable({
    type: "session.step.ended",
    ...options,
    schema: {
      ...Base2,
      assistantMessageID: session_message_exports.ID,
      finish: FinishReason,
      rawFinish: Schema35.String.pipe(optional),
      native: session_message_exports.Native.pipe(optional),
      cost: money_exports.USD,
      tokens: token_usage_exports.Info,
      snapshot: snapshot_exports.ID.pipe(optional),
      files: Schema35.Array(RelativePath).pipe(optional)
    }
  });
  Step2.Failed = event_exports.durable({
    type: "session.step.failed",
    ...options,
    schema: {
      ...Base2,
      assistantMessageID: session_message_exports.ID,
      error: session_error_exports.Error,
      finish: Schema35.Literals(["content-filter"]).pipe(optional),
      rawFinish: Schema35.String.pipe(optional),
      native: session_message_exports.Native.pipe(optional),
      cost: money_exports.USD.pipe(optional),
      tokens: token_usage_exports.Info.pipe(optional),
      snapshot: snapshot_exports.ID.pipe(optional),
      files: Schema35.Array(RelativePath).pipe(optional)
    }
  });
})(Step || (Step = {}));
var Text;
(function(Text2) {
  Text2.Started = event_exports.durable({
    type: "session.text.started",
    ...options,
    schema: {
      ...Base2,
      assistantMessageID: session_message_exports.ID,
      ordinal: NonNegativeInt
    }
  });
  Text2.Delta = event_exports.ephemeral({
    type: "session.text.delta",
    schema: {
      ...Base2,
      assistantMessageID: session_message_exports.ID,
      ordinal: NonNegativeInt,
      delta: Schema35.String
    }
  });
  Text2.Ended = event_exports.durable({
    type: "session.text.ended",
    ...options,
    schema: {
      ...Base2,
      assistantMessageID: session_message_exports.ID,
      ordinal: NonNegativeInt,
      text: Schema35.String,
      native: session_message_exports.Native.pipe(optional)
    }
  });
})(Text || (Text = {}));
var Reasoning;
(function(Reasoning2) {
  Reasoning2.Started = event_exports.durable({
    type: "session.reasoning.started",
    ...options,
    schema: {
      ...Base2,
      assistantMessageID: session_message_exports.ID,
      ordinal: NonNegativeInt,
      native: session_message_exports.Native.pipe(optional)
    }
  });
  Reasoning2.Delta = event_exports.ephemeral({
    type: "session.reasoning.delta",
    schema: {
      ...Base2,
      assistantMessageID: session_message_exports.ID,
      ordinal: NonNegativeInt,
      delta: Schema35.String
    }
  });
  Reasoning2.Ended = event_exports.durable({
    type: "session.reasoning.ended",
    ...options,
    schema: {
      ...Base2,
      assistantMessageID: session_message_exports.ID,
      ordinal: NonNegativeInt,
      text: Schema35.String,
      native: session_message_exports.Native.pipe(optional)
    }
  });
})(Reasoning || (Reasoning = {}));
var Tool;
(function(Tool2) {
  const ToolBase = {
    ...Base2,
    assistantMessageID: session_message_exports.ID,
    id: Schema35.String
  };
  let Input;
  (function(Input2) {
    Input2.Started = event_exports.durable({
      type: "session.tool.input.started",
      ...options,
      schema: {
        ...ToolBase,
        name: Schema35.String
      }
    });
    Input2.Delta = event_exports.ephemeral({
      type: "session.tool.input.delta",
      schema: {
        ...ToolBase,
        delta: Schema35.String
      }
    });
    Input2.Ended = event_exports.durable({
      type: "session.tool.input.ended",
      ...options,
      schema: {
        ...ToolBase,
        text: Schema35.String
      }
    });
  })(Input = Tool2.Input || (Tool2.Input = {}));
  Tool2.Called = event_exports.durable({
    type: "session.tool.called",
    ...options,
    schema: {
      ...ToolBase,
      input: Schema35.Record(Schema35.String, Schema35.Unknown),
      executed: Schema35.Boolean,
      native: session_message_exports.Native.pipe(optional)
    }
  });
  Tool2.Progress = event_exports.ephemeral({
    type: "session.tool.progress",
    schema: {
      ...ToolBase,
      metadata: Schema35.Record(Schema35.String, Schema35.Json)
    }
  });
  Tool2.Success = event_exports.durable({
    type: "session.tool.success",
    durable: {
      aggregate: "sessionID",
      version: 2
    },
    schema: {
      ...ToolBase,
      content: Schema35.NonEmptyArray(Content),
      metadata: Schema35.Record(Schema35.String, Schema35.Json).pipe(optional),
      executed: Schema35.Boolean,
      native: session_message_exports.Native.pipe(optional)
    }
  });
  Tool2.Failed = event_exports.durable({
    type: "session.tool.failed",
    durable: {
      aggregate: "sessionID",
      version: 2
    },
    schema: {
      ...ToolBase,
      error: session_error_exports.Error,
      content: Schema35.NonEmptyArray(Content).pipe(optional),
      metadata: Schema35.Record(Schema35.String, Schema35.Json).pipe(optional),
      executed: Schema35.Boolean,
      native: session_message_exports.Native.pipe(optional)
    }
  });
})(Tool || (Tool = {}));
var RetryScheduled = event_exports.durable({
  type: "session.retry.scheduled",
  ...options,
  schema: {
    ...Base2,
    assistantMessageID: session_message_exports.ID,
    attempt: PositiveInt,
    at: NonNegativeInt,
    error: session_error_exports.Error
  }
});
var Compaction4;
(function(Compaction5) {
  Compaction5.Started = event_exports.durable({
    type: "session.compaction.started",
    ...options,
    schema: {
      ...Base2,
      reason: Schema35.Literals(["auto", "manual"]),
      inputID: session_message_exports.ID.pipe(optional)
    }
  });
  Compaction5.Delta = event_exports.ephemeral({
    type: "session.compaction.delta",
    schema: {
      ...Base2,
      text: Schema35.String
    }
  });
  Compaction5.Ended = event_exports.durable({
    type: "session.compaction.ended",
    ...options,
    schema: {
      ...Base2,
      reason: Compaction5.Started.data.fields.reason,
      model: session_message_exports.CompactionCompleted.fields.model,
      native: session_message_exports.CompactionCompleted.fields.native,
      text: Schema35.String,
      // Repeats the internal `session.usage.recorded` figures: that event never reaches clients, and it
      // stays the accounting source for session totals and stats.
      cost: session_message_exports.CompactionCompleted.fields.cost,
      tokens: session_message_exports.CompactionCompleted.fields.tokens
    }
  });
  Compaction5.Failed = event_exports.durable({
    type: "session.compaction.failed",
    ...options,
    schema: {
      ...Base2,
      reason: Compaction5.Started.data.fields.reason,
      error: session_error_exports.Error,
      inputID: session_message_exports.ID.pipe(optional),
      cost: session_message_exports.CompactionFailed.fields.cost,
      tokens: session_message_exports.CompactionFailed.fields.tokens
    }
  });
})(Compaction4 || (Compaction4 = {}));
var RevertEvent;
(function(RevertEvent2) {
  RevertEvent2.Staged = event_exports.durable({
    type: "session.revert.staged",
    ...options,
    schema: { ...Base2, revert: Revert }
  });
  RevertEvent2.Cleared = event_exports.durable({ type: "session.revert.cleared", ...options, schema: Base2 });
  RevertEvent2.Committed = event_exports.durable({
    type: "session.revert.committed",
    ...options,
    schema: { ...Base2, to: session_message_exports.ID }
  });
})(RevertEvent || (RevertEvent = {}));
var Definitions = event_exports.inventory(Created3, AgentSelected2, ModelSelected2, Moved, Renamed, MetadataUpdated, Permissions, Viewed, Archived, Unarchived, UsageUpdated, Deleted2, Forked, InboxDelivered, InboxEnqueued, InboxCancelled, InboxDeliveryChanged, Execution.Started, Execution.Succeeded, Execution.Failed, Execution.Interrupted, InstructionsUpdated, Synthetic3, Skill2.Activated, Shell2.Started, Shell2.Ended, Step.Started, Step.Streamed, Step.Ended, Step.Failed, Text.Started, Text.Delta, Text.Ended, Reasoning.Started, Reasoning.Delta, Reasoning.Ended, Tool.Input.Started, Tool.Input.Delta, Tool.Input.Ended, Tool.Called, Tool.Progress, Tool.Success, Tool.Failed, RetryScheduled, Compaction4.Started, Compaction4.Delta, Compaction4.Ended, Compaction4.Failed, RevertEvent.Staged, RevertEvent.Cleared, RevertEvent.Committed);
var DurableDefinitions = event_exports.inventory(...Definitions.filter((definition) => definition.durability === "durable"), UsageRecorded, MessageContentUpdated);
var EphemeralDefinitions = event_exports.inventory(...Definitions.filter((definition) => definition.durability === "ephemeral"));
var Durable = Schema35.Union(DurableDefinitions, { mode: "oneOf" }).annotate({ identifier: "Session.Event.Durable" }).pipe(Schema35.toTaggedUnion("type"));
var All = Schema35.Union([Durable, ...EphemeralDefinitions], { mode: "oneOf" }).pipe(Schema35.toTaggedUnion("type"));

// node_modules/@opencode/schema/dist/session.js
var ID14 = SessionID;
var Metadata3 = SessionMetadata;
var Event11 = session_event_exports;
var ForkBoundary = session_fork_exports.Boundary;
var Info16 = Schema36.Struct({
  id: ID14,
  parentID: ID14.pipe(optional),
  fork: Schema36.Struct({
    sessionID: ID14,
    boundary: ForkBoundary
  }).pipe(optional),
  projectID: project_exports.ID,
  agent: agent_exports.ID.pipe(optional),
  model: model_exports.Ref.pipe(optional),
  cost: money_exports.USD,
  tokens: token_usage_exports.Info,
  /** Outcome of the last completed execution, recorded at `time.idle`. Absent until a run reaches a terminal transition. */
  outcome: Schema36.Literals(["succeeded", "failed", "interrupted"]).pipe(optional),
  time: Schema36.Struct({
    created: DateTimeUtcFromMillis,
    updated: DateTimeUtcFromMillis,
    /** Start of the most recent execution. While it runs, `idle` still holds the previous execution's end. Resuming after a restart starts a new execution. */
    busy: DateTimeUtcFromMillis.pipe(optional),
    /** End of the most recent completed execution. */
    idle: DateTimeUtcFromMillis.pipe(optional),
    viewed: DateTimeUtcFromMillis.pipe(optional),
    archived: DateTimeUtcFromMillis.pipe(optional)
  }),
  title: Schema36.String.pipe(optional),
  location: location_exports.Ref,
  subpath: RelativePath.pipe(optional),
  metadata: Metadata3.pipe(optional),
  /** Evaluated after the agent's rules; the last matching rule wins. */
  permissions: permission_exports.Ruleset.pipe(optional),
  revert: Revert.pipe(optional)
}).annotate({ identifier: "Session.Info" });
var ListAnchor = Schema36.Struct({
  id: ID14,
  time: Schema36.Finite,
  direction: Schema36.Literals(["previous", "next"])
}).annotate({ identifier: "Session.ListAnchor" });
var ListFilterFields = {
  order: Schema36.Literals(["asc", "desc"]).pipe(Schema36.optional).annotate({
    description: "Session order for the first page. Use desc for newest first or asc for oldest first."
  }),
  search: Schema36.String.pipe(Schema36.optional),
  parentID: Schema36.Union([
    ID14,
    Schema36.Null.pipe(Schema36.encodeTo(Schema36.Literal("null"), {
      decode: SchemaGetter2.transform(() => null),
      encode: SchemaGetter2.transform(() => "null")
    }))
  ]).annotate({ description: "Filter by parent session. Use null to return only root sessions." }).pipe(Schema36.optional),
  archived: Schema36.Literals(["true", "false"]).pipe(Schema36.decodeTo(Schema36.Boolean, {
    decode: SchemaGetter2.transform((value) => value === "true"),
    encode: SchemaGetter2.transform((value) => value ? "true" : "false")
  })).annotate({
    description: "Filter by archive state. Use true to return only archived sessions or false to exclude them. Omit to include both."
  }).pipe(Schema36.optional)
};
var ListFilter = Schema36.Struct({
  ...ListFilterFields,
  directory: AbsolutePath.pipe(Schema36.optional),
  project: project_exports.ID.pipe(Schema36.optional),
  subpath: RelativePath.pipe(Schema36.optional)
}).annotate({ identifier: "Session.ListFilter" });
var ListCursorInput = Schema36.Union([
  Schema36.Struct({ ...ListFilterFields, directory: AbsolutePath, anchor: ListAnchor }),
  Schema36.Struct({
    ...ListFilterFields,
    project: project_exports.ID,
    subpath: RelativePath.pipe(Schema36.optional),
    anchor: ListAnchor
  }),
  Schema36.Struct({ ...ListFilterFields, anchor: ListAnchor })
]);
var ListCursorJson = Schema36.fromJsonString(ListCursorInput);
var encodeListCursor = Schema36.encodeSync(ListCursorJson);
var decodeListCursor = Schema36.decodeUnknownEffect(ListCursorJson);
var ListCursor = Schema36.String.pipe(Schema36.brand("SessionsCursor"), Schema36.annotate({
  identifier: "SessionsCursor",
  description: "Opaque pagination cursor returned as cursor.previous or cursor.next in the previous response."
}), statics((schema) => {
  const make = SchemaParser.make(schema);
  return {
    make: (input) => make(Base64Url.encode(encodeListCursor(input))),
    parse: (input) => Effect4.suspend(() => {
      const result = Base64Url.decodeString(input);
      return Result.isFailure(result) ? Effect4.fail("Invalid cursor") : decodeListCursor(result.success).pipe(Effect4.mapError(() => "Invalid cursor"));
    })
  };
}));

// src/attention.js
function createAttention() {
  const approvals = /* @__PURE__ */ new Map();
  const questions = /* @__PURE__ */ new Map();
  const looked = /* @__PURE__ */ new Set();
  const changes = /* @__PURE__ */ new Map();
  let epoch = 0, listeners = 0;
  const add = (map, session, id2) => {
    if (typeof session !== "string" || typeof id2 !== "string") return;
    let set = map.get(session);
    if (!set) map.set(session, set = /* @__PURE__ */ new Set());
    set.add(id2);
  };
  const drop = (map, session, id2) => {
    if (typeof session !== "string") return;
    const set = map.get(session);
    if (!set) return;
    set.delete(
      /** @type {string} */
      id2
    );
    if (!set.size) map.delete(session);
  };
  const changed = (session) => {
    if (typeof session === "string") changes.set(session, (changes.get(session) ?? 0) + 1);
  };
  const forget = (session) => {
    approvals.delete(session);
    questions.delete(session);
  };
  function clear() {
    approvals.clear();
    questions.clear();
    looked.clear();
    changes.clear();
    epoch++;
  }
  function event(event2) {
    const data = event2?.data ?? {};
    switch (event2?.type) {
      case "permission.asked":
        changed(data.sessionID);
        add(approvals, data.sessionID, data.id);
        break;
      case "permission.replied":
        changed(data.sessionID);
        drop(approvals, data.sessionID, data.requestID);
        break;
      case "form.created":
        add(questions, data.form?.sessionID, data.form?.id);
        break;
      case "form.replied":
      case "form.cancelled":
        drop(questions, data.sessionID, data.id);
        break;
      // An idle session is not blocked on anyone, whatever an event was missed.
      case "session.idle":
        changed(data.sessionID);
        forget(data.sessionID);
        break;
      case "session.deleted":
        changed(data.sessionID);
        forget(data.sessionID);
        looked.delete(data.sessionID);
        break;
    }
  }
  function listen() {
    listeners++;
    let stopped = false;
    return () => {
      if (stopped) return;
      stopped = true;
      if (--listeners === 0) clear();
    };
  }
  async function refresh(sessionIDs, listApprovals) {
    if (!listApprovals || !listeners) return;
    await Promise.all(sessionIDs.filter((id2) => !looked.has(id2)).map(async (id2) => {
      looked.add(id2);
      const before = changes.get(id2) ?? 0, started = epoch;
      let found;
      try {
        found = await listApprovals(id2);
      } catch {
        if (epoch === started) looked.delete(id2);
        return;
      }
      if (epoch !== started) return;
      if ((changes.get(id2) ?? 0) !== before || !listeners) {
        looked.delete(id2);
        return;
      }
      for (const request of found ?? []) add(approvals, id2, request?.id);
    }));
  }
  const of = (sessionID2) => !listeners ? void 0 : approvals.has(sessionID2) ? "approval" : questions.has(sessionID2) ? "input" : void 0;
  return { event, listen, refresh, of };
}

// src/core.js
import { randomUUID } from "node:crypto";

// src/manage-schema.js
var CAPABILITIES = Object.freeze([
  "createSession",
  "createTeam",
  "changeMembers",
  "workAcrossProjects",
  "openConnection",
  "extendConnection"
]);
var CAPABILITY_VALUES = Object.freeze(["allow", "ask", "deny"]);
var label = (description) => ({ kind: "label", description });
var sessions = (min, description) => ({ kind: "sessions", min, max: 32, description });
var id = (prefix, description) => ({ kind: "id", prefix, description });
var ACTIONS = {
  "profile.update": {
    description: "Change the acting session's own collaboration name and/or role. Other sessions cannot be targeted. Does not rename the native session title.",
    fields: { name: { ...label('New display name. Not "You" or "user".'), kind: "name" }, role: label("New role.") },
    atLeastOne: true,
    example: { name: "Reviewer", role: "Code review" }
  },
  "team.create": {
    description: "Create a team. Members can message each other across projects. Needs createTeam and changeMembers (and workAcrossProjects when members span projects).",
    fields: {
      name: { ...label("Unique team name."), required: true },
      members: { ...sessions(1, "Session IDs; must include the acting session."), required: true }
    },
    example: { name: "Release review", members: ["ses_SELF", "ses_OTHER"] }
  },
  "team.members": {
    description: "Replace the complete member list of a team the acting session belongs to. Needs changeMembers.",
    fields: {
      id: { ...id("team_", "Team ID from discover."), required: true },
      members: { ...sessions(1, "Complete new member list; must include the acting session."), required: true }
    },
    example: { id: "team_ID", members: ["ses_SELF", "ses_OTHER"] }
  },
  "team.delete": {
    description: "Delete a team the acting session belongs to. Needs changeMembers.",
    fields: { id: { ...id("team_", "Team ID from discover."), required: true } },
    example: { id: "team_ID" }
  },
  "connection.create": {
    description: "Open a temporary connection so its members can message each other until it expires or closes. Needs openConnection.",
    fields: {
      members: { ...sessions(2, "Session IDs; must include the acting session."), required: true },
      minutes: { kind: "minutes", description: "Lifetime in minutes. Defaults to limits.connectionMinutes." }
    },
    example: { members: ["ses_SELF", "ses_OTHER"], minutes: 30 }
  },
  "connection.extend": {
    description: "Extend an active connection the acting session belongs to. Needs extendConnection.",
    fields: {
      id: { ...id("connection_", "Connection ID from discover."), required: true },
      minutes: { kind: "minutes", description: "New lifetime from now. Defaults to limits.connectionMinutes." }
    },
    example: { id: "connection_ID", minutes: 60 }
  },
  "connection.close": {
    description: "Close a connection the acting session belongs to. Needs no capability.",
    fields: { id: { ...id("connection_", "Connection ID from discover."), required: true } },
    example: { id: "connection_ID" }
  },
  "session.create": {
    description: "Create an idle teammate session. Needs createSession (and changeMembers with teamID). Call discover with catalog:true for valid agent and model values.",
    fields: {
      name: { ...label('Display name. Not "You" or "user".'), kind: "name", required: true },
      role: { ...label("Role."), required: true },
      agent: { ...label("OpenCode agent ID from discover self.catalog.agents."), required: true },
      directory: { kind: "path", required: true, description: "Absolute project folder." },
      model: { kind: "model", required: true, description: "Model from discover self.catalog.models." },
      teamID: id("team_", "Optional team of the acting session. The new session joins it. It is listed either way.")
    },
    example: {
      name: "Reviewer",
      role: "Code review",
      agent: "build",
      directory: "C:/Projects/Example",
      model: { providerID: "PROVIDER", id: "MODEL" }
    }
  },
  "policy.update": {
    description: "Request a change to agent capabilities. Always needs human approval.",
    fields: { capabilities: { kind: "capabilities", required: true, description: "Capabilities to change; omitted ones keep their value." } },
    example: { capabilities: { createSession: "allow" } }
  },
  "discovery.register": { description: "List the acting session for other agents. Input {}.", fields: {}, example: {} },
  "discovery.unregister": { description: "Remove the acting session from the list. Input {}.", fields: {}, example: {} },
  "discovery.update": {
    description: "Request a discovery mode change. Always needs human approval.",
    fields: { mode: { kind: "enum", values: ["registered", "automatic"], required: true, description: "registered lists only joined sessions." } },
    example: { mode: "registered" }
  }
};
var sessionID = (value) => typeof value === "string" && /^ses_[\w.:-]{1,156}$/.test(value);
var UNSAFE_TEXT = /[\p{Cc}\p{Cf}\u2028\u2029]/u;
var isLabel = (value) => typeof value === "string" && value.trim().length > 0 && value.length <= 120 && !UNSAFE_TEXT.test(value);
var RESERVED_NAMES = Object.freeze(["you", "user"]);
var LOOK_ALIKES = {
  "\u03A5": "y",
  "\u03D2": "y",
  "\u13A9": "y",
  "\u04AE": "y",
  "\u0423": "y",
  "\u0443": "y",
  "\u04AF": "y",
  "\u028F": "y",
  "\u03B3": "y",
  "\u043E": "o",
  "\u03BF": "o",
  "\u0585": "o",
  "\u1D0F": "o",
  "\u03C5": "u",
  "\u057D": "u",
  "\u1D1C": "u",
  "\u03BC": "u",
  "\u0455": "s",
  "\uA731": "s",
  "\u0435": "e",
  "\u04BD": "e",
  "\u1D07": "e",
  "\u0433": "r",
  "\u0280": "r",
  "\uAB47": "r"
};
var look = (character) => LOOK_ALIKES[character] ?? LOOK_ALIKES[character.toLowerCase()] ?? character.toLowerCase();
var isReservedName = (value) => {
  const letters = [...String(value).normalize("NFKD").replace(/[\p{M}\p{Default_Ignorable_Code_Point}\u2800\u3164\uFFA0]/gu, "").normalize("NFKC").trim()].map(look);
  return RESERVED_NAMES.some((word) => letters.length === word.length && letters.every((character, index) => character === word[index] || !/[\u0000-\u007f]/.test(character)) && letters.filter((character, index) => character !== word[index]).length <= 1);
};
var isDisplayName = (value) => isLabel(value) && !isReservedName(value);
var UNSAFE_ALL = new RegExp(UNSAFE_TEXT.source, "gu");
var cleanLabel = (value) => String(value ?? "").replace(/[\r\n\u2028\u2029]+/g, " ").replace(UNSAFE_ALL, "").trim();
var nameKey = (value) => String(value).normalize("NFKC").trim().toLowerCase();
var object = (value) => value !== null && typeof value === "object" && !Array.isArray(value);
function check(field, value, limits) {
  switch (field.kind) {
    case "label":
      return isLabel(value) ? "" : "must be a nonblank string of at most 120 characters, without control or invisible characters";
    case "name":
      return isDisplayName(value) ? "" : 'must be a nonblank string of at most 120 characters, without control or invisible characters, and not "You" or "user"';
    case "id":
      return typeof value === "string" && value.startsWith(field.prefix) && /^[\w.:-]{1,160}$/.test(value) ? "" : `must be an ID starting with ${field.prefix}`;
    case "enum":
      return field.values.includes(value) ? "" : `must be one of: ${field.values.join(", ")}`;
    case "path":
      return typeof value === "string" && /^(?:[A-Za-z]:[\\/]|\/)/.test(value) ? "" : "must be an absolute path";
    case "minutes":
      return Number.isSafeInteger(value) && value >= 1 && value <= limits.maxConnectionMinutes ? "" : `must be a whole number from 1 to ${limits.maxConnectionMinutes}`;
    case "sessions":
      if (!Array.isArray(value) || value.length < field.min || value.length > field.max) return `must list ${field.min}-${field.max} session IDs`;
      if (!value.every(sessionID)) return "must contain only session IDs starting with ses_";
      return new Set(value).size === value.length ? "" : "must not repeat a session";
    case "model": {
      if (!object(value)) return "must be an object {providerID, id, variant?}";
      const problems = [];
      if (!isLabel(value.providerID)) problems.push("providerID is required");
      if (!isLabel(value.id)) problems.push("id is required");
      if (value.variant !== void 0 && !isLabel(value.variant)) problems.push("variant must be a nonblank string");
      const extra = Object.keys(value).filter((key) => !["providerID", "id", "variant"].includes(key));
      if (extra.length) problems.push(`unknown fields: ${extra.join(", ")}`);
      return problems.join("; ");
    }
    case "capabilities": {
      if (!object(value) || !Object.keys(value).length) return `must set at least one of: ${CAPABILITIES.join(", ")}`;
      const bad = Object.entries(value).filter(([key, setting]) => !CAPABILITIES.includes(key) || !CAPABILITY_VALUES.includes(setting));
      return bad.length ? `unknown capability or value: ${bad.map(([key]) => key).join(", ")}; values are allow, ask or deny` : "";
    }
  }
  return "is not accepted";
}
function hintFor(action) {
  const spec = ACTIONS[action];
  if (!spec) return `action must be one of: ${Object.keys(ACTIONS).join(", ")}`;
  const fields = Object.entries(spec.fields);
  const required = fields.filter(([, field]) => field.required).map(([name]) => name);
  const optional2 = fields.filter(([, field]) => !field.required).map(([name]) => name);
  return [
    required.length ? `required: ${required.join(", ")}` : "",
    optional2.length ? `optional: ${optional2.join(", ")}` : "",
    spec.atLeastOne ? "set at least one field" : "",
    `example: ${JSON.stringify(spec.example)}`
  ].filter(Boolean).join("; ");
}
function validateInput(action, input, limits) {
  const spec = ACTIONS[action];
  if (!spec) return { missing: [], invalid: [{ field: "action", reason: `must be one of: ${Object.keys(ACTIONS).join(", ")}` }] };
  if (!object(input)) return { missing: [], invalid: [{ field: "input", reason: "must be an object" }] };
  const missing = [], invalid = [];
  for (const key of Object.keys(input)) {
    if (!Object.hasOwn(spec.fields, key)) invalid.push({ field: key, reason: `is not accepted by ${action}` });
  }
  for (const [name, field] of Object.entries(spec.fields)) {
    if (!Object.hasOwn(input, name) || input[name] === void 0) {
      if (field.required) missing.push(name);
      continue;
    }
    const reason = check(field, input[name], limits);
    if (reason) invalid.push({ field: name, reason });
  }
  if (spec.atLeastOne && !Object.keys(spec.fields).some((name) => input[name] !== void 0) && !invalid.length)
    missing.push(Object.keys(spec.fields).join(" or "));
  return { missing, invalid };
}
function fieldSchema(field, limits) {
  const description = field.description;
  switch (field.kind) {
    case "label":
    case "name":
      return { type: "string", minLength: 1, maxLength: 120, description };
    case "id":
      return { type: "string", pattern: `^${field.prefix}`, description };
    case "enum":
      return { type: "string", enum: field.values, description };
    case "path":
      return { type: "string", description };
    case "minutes":
      return { type: "integer", minimum: 1, maximum: limits.maxConnectionMinutes, description };
    case "sessions":
      return {
        type: "array",
        items: { type: "string", pattern: "^ses_" },
        minItems: field.min,
        maxItems: field.max,
        uniqueItems: true,
        description
      };
    case "model":
      return {
        type: "object",
        description,
        required: ["providerID", "id"],
        additionalProperties: false,
        properties: { providerID: { type: "string" }, id: { type: "string" }, variant: { type: "string" } }
      };
    case "capabilities":
      return {
        type: "object",
        description,
        minProperties: 1,
        additionalProperties: false,
        properties: Object.fromEntries(CAPABILITIES.map((key) => [key, { type: "string", enum: CAPABILITY_VALUES }]))
      };
  }
}
function manageSchema(limits) {
  return {
    type: "object",
    additionalProperties: false,
    required: ["action", "input"],
    properties: {
      action: { type: "string", enum: Object.keys(ACTIONS) },
      input: { description: "Use the branch whose title equals action.", anyOf: Object.entries(ACTIONS).map(([action, spec]) => {
        const required = Object.entries(spec.fields).filter(([, field]) => field.required).map(([name]) => name);
        return {
          title: action,
          description: spec.description,
          type: "object",
          additionalProperties: false,
          ...required.length ? { required } : {},
          ...spec.atLeastOne ? { minProperties: 1 } : {},
          properties: Object.fromEntries(Object.entries(spec.fields).map(([name, field]) => [name, fieldSchema(field, limits)]))
        };
      }) }
    }
  };
}
function manageDescription() {
  return [
    "Manage the acting session's profile, teams, connections, new sessions and capability requests.",
    "Each capability in discover self.capabilities is allow (proceeds), ask (waits for human approval) or deny (refused).",
    'A refusal returns {"error":{code, missing, invalid, hint, remedy}} instead of a result; nothing was changed. Examples:',
    ...Object.entries(ACTIONS).map(([action, spec]) => `${JSON.stringify({ action, input: spec.example })} - ${spec.description}`)
  ].join("\n");
}

// src/engine/shared.js
var DEFAULT_CAPABILITIES = Object.freeze(Object.fromEntries(CAPABILITIES.map((key) => [key, "ask"])));
var DEFAULT_LIMITS = Object.freeze({
  messageBytes: 32768,
  messagesPerMinute: 30,
  maxHops: 100,
  messagesPerConversation: 100,
  connectionMinutes: 60,
  maxConnectionMinutes: 1440,
  managedSessions: 16,
  records: 2e3
});
var REMOVE_DATA_CONFIRMATION = "remove-all-saved-data";
var REMEDY = {
  invalid_action_input: "Correct the listed fields and call again.",
  state_changed_request_again: "Call discover, then submit a new request. The earlier approval does not carry over.",
  team_not_found: "Call discover and use the ID of a team that lists this session as a member.",
  connection_not_found: "Call discover and use the ID of a connection that lists this session as a member.",
  connection_expired: "Open a new connection with connection.create.",
  member_not_registered: "Ask those sessions to call manage discovery.register, or ask the user to enable automatic listing.",
  team_name_exists: "Choose a different team name.",
  communication_not_authorized: "Share a project, join a common team, or open a connection with connection.create.",
  rate_limit: "Wait until the oldest message in the last minute expires, then retry with the same key.",
  conversation_limit: "Start a new conversation without replyTo.",
  hop_limit: "Start a new conversation without replyTo.",
  invalid_session: "Call discover for current session IDs.",
  invalid_session_id: "Use a session ID starting with ses_ from discover.",
  self_message: "Send to a different session.",
  recipient_archived: "Choose a session that is not archived.",
  invalid_reply: "replyTo must be a recent message this session received from the recipient. If it has aged out of history, send a new message without replyTo.",
  idempotency_conflict: "Use a new key for different content; reuse a key only to retry the same message.",
  not_message_recipient: "Acknowledge only messages addressed to this session. A message that has aged out of history needs no acknowledgement.",
  cancelled: "Submit the request again if it is still needed.",
  unknown_action: "Use one of the listed actions.",
  invalid_setting: "Send exactly one of command, discoveryMode or capabilities.",
  invalid_discovery_mode: "Use registered or automatic.",
  invalid_stored_state: "Preserve the saved data and its backup; it was left unchanged."
};
var AgentTeamsError = class extends Error {
  constructor(code, details = {}) {
    super(code);
    this.code = code;
    this.details = { ...REMEDY[code] && !details.remedy ? { remedy: REMEDY[code] } : {}, ...details };
  }
  toJSON() {
    return { code: this.code, ...this.details };
  }
};
var fail = (code, details) => {
  throw new AgentTeamsError(code, details);
};
var clone = (value) => structuredClone(value);
var identifier = (value) => typeof value === "string" && /^[\w.:-]{1,160}$/.test(value);
var millis = (value) => value instanceof Date ? value.getTime() : typeof value === "number" ? value : Date.parse(value ?? "") || 0;
function limitsFrom(options2 = {}) {
  const limits = { ...DEFAULT_LIMITS, ...options2 };
  for (const [key, value] of Object.entries(limits)) {
    if (!Object.hasOwn(DEFAULT_LIMITS, key) || !Number.isSafeInteger(value) || value < 1) fail("invalid_limit");
  }
  if (limits.messageBytes > 32768 || limits.maxConnectionMinutes < limits.connectionMinutes) fail("invalid_limit");
  return limits;
}
function serialQueue() {
  let tail = (
    /** @type {Promise<unknown>} */
    Promise.resolve()
  );
  function run(task) {
    const result = tail.then(task);
    tail = result.catch(() => {
    });
    return result;
  }
  return run;
}

// src/history.js
var NO_TEAM = "none";
var GENERAL = "general";
var HISTORY_BYTES = 8 * 1024 * 1024;
var RECENT_RECORDS = 200;
var RETRY_WINDOW = 15 * 60 * 1e3;
var INDEX_KEY = "collaboration.v1.index";
var HISTORY_PREFIX = "collaboration.v1.history.";
var historyKey = (scope) => `${HISTORY_PREFIX}${scope}`;
var emptyHistory = () => ({ messages: {}, conversations: {}, audit: [] });
function scopeForMessage(state, from, to, parent) {
  const shared = Object.values(state.teams).filter((team) => team.members.includes(from) && team.members.includes(to));
  return shared.find((team) => team.id === parent?.scope)?.id ?? shared.map((team) => team.id).sort()[0] ?? NO_TEAM;
}
function scopesForAudit(state, actor, action, data) {
  const proposal = data.proposal ?? {};
  if (data.teamID ?? proposal.teamID) return [data.teamID ?? proposal.teamID];
  if (action.startsWith("team.")) {
    const id2 = proposal.id ?? Object.values(state.teams).find((team) => team.name === proposal.name)?.id;
    return [id2 ?? GENERAL];
  }
  if (action === "profile.update") {
    const id2 = data.sessionID ?? actor;
    const scopes = Object.values(state.teams).filter((team) => team.members.includes(id2)).map((team) => team.id);
    return scopes.length ? scopes : [GENERAL];
  }
  return [action.startsWith("connection.") ? NO_TEAM : GENERAL];
}
function expireRetries(state, time) {
  for (const [key, operation] of Object.entries(state.operations)) {
    if (operation.at <= time - RETRY_WINDOW) delete state.operations[key];
  }
  for (const [id2, receipt] of Object.entries(state.receipts)) {
    if (receipt.at <= time - RETRY_WINDOW) delete state.receipts[id2];
  }
}
function unacknowledged(history) {
  const waiting = {};
  for (const message of Object.values(history.messages)) {
    if (message.status === "accepted" || message.status === "delivered") (waiting[message.to] ??= []).push(message.id);
  }
  return waiting;
}
function historyCounts(state) {
  const count = (scope) => ({ messages: state.counts[scope]?.messages ?? 0, activity: state.counts[scope]?.activity ?? 0 });
  return { teams: Object.fromEntries(Object.keys(state.teams).map((id2) => [id2, count(id2)])), none: count(NO_TEAM), general: count(GENERAL) };
}
function openHistory(storage, state, savedCoreText, { records, now, invalid }) {
  const loaded = /* @__PURE__ */ new Map(), dirty = /* @__PURE__ */ new Set(), forgotten = /* @__PURE__ */ new Set();
  let pending = [], index, indexDirty = false, savedCore = savedCoreText;
  async function scope(id2) {
    if (loaded.has(id2)) return loaded.get(id2);
    const saved = forgotten.has(id2) ? void 0 : await storage.get(historyKey(id2));
    if (saved !== void 0 && (!saved?.messages || !saved.conversations || !Array.isArray(saved.audit))) invalid();
    const history = saved === void 0 ? emptyHistory() : structuredClone(saved);
    for (const record of Object.values(history.messages)) {
      if (record.status !== "sending") continue;
      dirty.add(id2);
      const keyed = Object.values(state.operations).some((operation) => operation.id === record.id);
      if (keyed || record.at <= now() - RETRY_WINDOW) {
        record.status = "uncertain";
        record.error = "recovered_admission_unconfirmed";
      } else {
        delete history.messages[record.id];
        if (history.conversations[record.conversationID] > 1) history.conversations[record.conversationID]--;
        else delete history.conversations[record.conversationID];
      }
    }
    loaded.set(id2, history);
    return history;
  }
  async function readIndex() {
    if (index === void 0) {
      const saved = await storage.get(INDEX_KEY);
      if (saved !== void 0 && (!saved || typeof saved !== "object" || Array.isArray(saved))) invalid();
      index = structuredClone(saved ?? {});
    }
    return index;
  }
  async function find(id2) {
    if (Object.hasOwn(state.receipts, id2)) return state.receipts[id2];
    const known = await readIndex();
    return Object.hasOwn(known, id2) ? (await scope(known[id2])).messages[id2] : void 0;
  }
  async function add(record) {
    const history = await scope(record.scope), known = await readIndex();
    history.messages[record.id] = record;
    history.conversations[record.conversationID] = (history.conversations[record.conversationID] ?? 0) + 1;
    known[record.id] = record.scope;
    dirty.add(record.scope);
    indexDirty = true;
  }
  const touched = (record) => {
    if (!record.historyPruned) dirty.add(record.scope);
  };
  const audit = (entry, scopes) => pending.push({ entry, scopes });
  function forget(id2) {
    forgotten.add(id2);
    loaded.delete(id2);
    dirty.delete(id2);
    pending = pending.map((item) => ({ ...item, scopes: item.scopes.filter((scope2) => scope2 !== id2) }));
    for (const [key, operation] of Object.entries(state.operations)) if (operation.scope === id2) delete state.operations[key];
    for (const [key, receipt] of Object.entries(state.receipts)) if (receipt.scope === id2) delete state.receipts[key];
    delete state.counts[id2];
    if (state.unacknowledged) delete state.unacknowledged[id2];
  }
  function compact(history, message, known, time) {
    delete history.messages[message.id];
    delete known[message.id];
    if (message.at <= time - RETRY_WINDOW) return;
    const receipt = { historyPruned: true };
    for (const key of [
      "id",
      "from",
      "to",
      "conversationID",
      "hops",
      "delivery",
      "replyTo",
      "at",
      "status",
      "deliveredAt",
      "processedAt",
      "error",
      "scope",
      "retryUntil"
    ]) {
      if (message[key] !== void 0) receipt[key] = message[key];
    }
    state.receipts[message.id] = receipt;
  }
  function prune(history, known, time) {
    let count = 0, bytes = 0, full = false, trimmed = false;
    for (const message of Object.values(history.messages).reverse()) {
      const size = Buffer.byteLength(JSON.stringify(message), "utf8");
      if (message.status !== "sending" && count && (full || count >= records || bytes + size > HISTORY_BYTES)) {
        full = true;
        trimmed = true;
        compact(history, message, known, time);
      } else {
        count++;
        bytes += size;
      }
    }
    if (history.audit.length > records) history.audit = history.audit.slice(-records);
    const used = new Set([...Object.values(history.messages), ...Object.values(state.receipts)].map((item) => item.conversationID));
    for (const id2 of Object.keys(history.conversations)) if (!used.has(id2)) delete history.conversations[id2];
    return trimmed;
  }
  async function repair() {
    const rebuilt = {}, seen = /* @__PURE__ */ new Set(), live = (id2) => id2 === NO_TEAM || id2 === GENERAL || Object.hasOwn(state.teams, id2);
    let after;
    do {
      const page = await storage.scan({ prefix: HISTORY_PREFIX, limit: 20, ...after ? { after } : {} });
      for (const { key, value } of page.entries) {
        const id2 = key.slice(HISTORY_PREFIX.length);
        if (!live(id2)) {
          forget(id2);
          continue;
        }
        if (!value?.messages || !Array.isArray(value.audit)) invalid();
        seen.add(id2);
        for (const message of Object.keys(value.messages)) rebuilt[message] = id2;
        state.counts[id2] = { messages: Object.keys(value.messages).length, activity: value.audit.length };
        (state.unacknowledged ??= {})[id2] = unacknowledged(value);
      }
      after = page.next;
    } while (after);
    for (const id2 of Object.keys(state.counts)) if (!seen.has(id2)) delete state.counts[id2];
    for (const id2 of Object.keys(state.unacknowledged ?? {})) if (!seen.has(id2)) delete state.unacknowledged[id2];
    const known = await readIndex(), ids = Object.keys(rebuilt);
    if (ids.length !== Object.keys(known).length || ids.some((id2) => known[id2] !== rebuilt[id2])) {
      index = rebuilt;
      indexDirty = true;
    }
  }
  async function commit() {
    for (const { entry, scopes } of pending) {
      for (const id2 of scopes) {
        (await scope(id2)).audit.push(entry);
        dirty.add(id2);
      }
    }
    pending = [];
    const writeCore = async () => {
      const core = JSON.stringify(state);
      if (core !== savedCore) await storage.set("collaboration.v1", state);
      savedCore = core;
    };
    const removing = forgotten.size > 0;
    if (dirty.size || removing || indexDirty) {
      const known = await readIndex(), time = now();
      for (const id2 of forgotten) {
        for (const [message, owner] of Object.entries(known)) if (owner === id2) {
          delete known[message];
          indexDirty = true;
        }
      }
      const fresh = {};
      for (const id2 of dirty) {
        const history = await scope(id2);
        if (prune(history, known, time)) indexDirty = true;
        state.counts[id2] = { messages: Object.keys(history.messages).length, activity: history.audit.length };
        fresh[id2] = unacknowledged(history);
      }
      const before = savedCore === void 0 ? {} : JSON.parse(savedCore);
      const same = (a, b) => JSON.stringify(a && Object.keys(a).length ? a : {}) === JSON.stringify(b && Object.keys(b).length ? b : {});
      const changed = [...dirty].filter((id2) => !same(before.unacknowledged?.[id2], fresh[id2]));
      state.unacknowledged ??= {};
      if (removing) {
        for (const id2 of changed) state.unacknowledged[id2] = null;
        await writeCore();
      } else if (changed.length) {
        before.unacknowledged = { ...before.unacknowledged };
        for (const id2 of changed) before.unacknowledged[id2] = null;
        await storage.set("collaboration.v1", before);
        savedCore = JSON.stringify(before);
      }
      for (const id2 of dirty) await storage.set(historyKey(id2), loaded.get(id2));
      if (indexDirty) await storage.set(INDEX_KEY, known);
      for (const id2 of forgotten) await storage.remove(historyKey(id2));
      Object.assign(state.unacknowledged, fresh);
      if (removing && changed.length) await writeCore();
    }
    if (!removing) await writeCore();
    dirty.clear();
    forgotten.clear();
    indexDirty = false;
  }
  return { scope, find, add, touched, audit, forget, repair, commit };
}

// src/engine/store.js
var KEY = "collaboration.v1";
var ENDED_CONNECTION_KEPT = 7 * 24 * 60 * 60 * 1e3;
var initial = () => ({
  version: 1,
  revision: 0,
  capabilities: { ...DEFAULT_CAPABILITIES },
  profiles: {},
  discovery: { mode: "registered", registrations: {} },
  teams: {},
  connections: {},
  receipts: {},
  created: {},
  counts: {},
  unacknowledged: {},
  rate: {},
  operations: {}
});
var validCapabilities = (value) => value && typeof value === "object" && !Array.isArray(value) && Object.keys(value).length === CAPABILITIES.length && Object.entries(value).every(([key, setting]) => CAPABILITIES.includes(key) && CAPABILITY_VALUES.includes(setting));
function createStore({ storage, limits, now, queue: queue2, titles: titles2 }) {
  const open = /* @__PURE__ */ new WeakMap();
  const historyOf = (state) => open.get(state);
  const start = (state, savedText) => {
    const history = openHistory(storage, state, savedText, { records: limits.records, now, invalid: () => fail("invalid_stored_state") });
    open.set(state, history);
    return history;
  };
  async function load() {
    const state = await storage.get(KEY);
    if (state === void 0) {
      const fresh = initial();
      start(fresh, JSON.stringify(fresh));
      return fresh;
    }
    if (state?.version !== 1 || !state.teams || !state.connections || !state.operations || !state.profiles || !state.rate || !Number.isSafeInteger(state.revision) || !validCapabilities(state.capabilities)) fail("invalid_stored_state");
    const recovered = clone(state);
    const discovery = recovered.discovery;
    if (!discovery || !["registered", "automatic"].includes(discovery.mode) || !discovery.registrations || Array.isArray(discovery.registrations) || typeof discovery.registrations !== "object" || Object.entries(discovery.registrations).some(([id2, value]) => !identifier(id2) || !id2.startsWith("ses_") || value !== true)) fail("invalid_stored_state");
    for (const field of ["receipts", "created", "counts", "unacknowledged"]) {
      recovered[field] ??= {};
      if (!recovered[field] || typeof recovered[field] !== "object" || Array.isArray(recovered[field])) fail("invalid_stored_state");
    }
    start(recovered, JSON.stringify(state));
    return recovered;
  }
  async function save(state) {
    expireRetries(state, now());
    for (const [actor, times] of Object.entries(state.rate)) {
      const recent = times.filter((at) => at > now() - 6e4);
      if (recent.length) state.rate[actor] = recent;
      else delete state.rate[actor];
    }
    for (const [id2, connection] of Object.entries(state.connections)) {
      if ((connection.closedAt ?? connection.expiresAt) <= now() - ENDED_CONNECTION_KEPT) delete state.connections[id2];
    }
    await historyOf(state).commit();
  }
  async function maintain() {
    return queue2(async () => save(await load()));
  }
  function mergeCapabilities(current, change) {
    const valid2 = change && typeof change === "object" && !Array.isArray(change) && Object.keys(change).length > 0 && Object.entries(change).every(([key, value]) => CAPABILITIES.includes(key) && CAPABILITY_VALUES.includes(value));
    const merged = { ...current };
    if (valid2) for (const key of Object.keys(change)) merged[key] = change[key];
    if (!valid2 || !validCapabilities(merged)) fail("invalid_capabilities", {
      allowed: CAPABILITIES,
      values: CAPABILITY_VALUES,
      remedy: "Set one or more listed capabilities to allow, ask or deny."
    });
    return merged;
  }
  const configurationOf = (state) => ({ discoveryMode: state.discovery.mode, capabilities: clone(state.capabilities) });
  const configuration = () => queue2(async () => configurationOf(await load()));
  async function configure(input) {
    input = clone(input);
    return queue2(async () => {
      if (!input || typeof input !== "object" || Array.isArray(input) || Object.keys(input).length !== 1 || !["capabilities", "discoveryMode"].includes(Object.keys(input)[0])) fail("invalid_setting");
      const state = await load();
      if (Object.hasOwn(input, "capabilities")) state.capabilities = mergeCapabilities(state.capabilities, input.capabilities);
      else {
        if (!["registered", "automatic"].includes(input.discoveryMode)) fail("invalid_discovery_mode");
        state.discovery.mode = input.discoveryMode;
      }
      state.revision++;
      audit(state, "user", "settings.update", { proposal: clone(input) });
      await save(state);
      return configurationOf(state);
    });
  }
  function audit(state, actor, action, data, scopes = scopesForAudit(state, actor, action, data)) {
    historyOf(state).audit({ at: now(), actor, action, data }, scopes);
  }
  async function removeData(confirm) {
    if (confirm !== REMOVE_DATA_CONFIRMATION) fail("invalid_action_input");
    return queue2(async () => {
      for (; ; ) {
        const page = await storage.scan({ prefix: "", limit: 20 });
        if (!page.entries.length) break;
        for (const { key } of page.entries) await storage.remove(key);
      }
      titles2.clear();
      return { removed: true };
    });
  }
  return { load, save, historyOf, audit, maintain, mergeCapabilities, configuration, configure, removeData };
}

// src/engine/sessions.js
var managed = (item, state) => !item.time?.archived && Object.hasOwn(state.created, item.id) && !Object.values(state.teams).some((team) => team.members.includes(item.id));
var listedSession = (state, item) => Object.hasOwn(state.discovery.registrations, item.id) || state.discovery.mode === "automatic" && !item.parentID;
var SESSION_NOT_FOUND = ["Session.NotFoundError", "SessionNotFoundError"];
var sessionNotFound = (error, id2) => SESSION_NOT_FOUND.includes(error?._tag) && error.sessionID === id2;
function identity(item, state) {
  const profile = state.profiles[item.id] ?? {};
  const time = item.time ?? {};
  const name = cleanLabel(profile.name ?? item.title) || item.id;
  return {
    sessionID: item.id,
    name: isReservedName(name) ? `${name} (agent)` : name,
    role: cleanLabel(profile.role ?? item.agent) || "agent",
    projectID: item.projectID,
    directory: item.location.directory,
    archived: Boolean(time.archived),
    ...item.model ? { model: {
      id: item.model.id,
      providerID: item.model.providerID,
      ...item.model.variant ? { variant: item.model.variant } : {}
    } } : {},
    registered: Object.hasOwn(state.discovery.registrations, item.id),
    activity: millis(time.busy) > millis(time.idle) ? "running" : "idle"
  };
}
var folderKey = (directory) => {
  const text = String(directory).replaceAll("\\", "/").replace(/\/+$/, "");
  return /^([a-z]:|\/\/)/i.test(text) ? text.toLowerCase() : text;
};
var within = (directory, parent) => {
  const inner = folderKey(directory), outer = folderKey(parent);
  return !inner.split("/").includes("..") && (inner === outer || inner.startsWith(`${outer}/`));
};
var projectKey = (item) => item.projectID === "global" ? `directory:${item.location.directory}` : item.projectID;
var isListed = (state, id2) => state.discovery.mode === "automatic" || Object.hasOwn(state.discovery.registrations, id2);
function createSessions({ session, titles: titles2, now, catalog, queue: queue2, store: { load, save, historyOf, audit } }) {
  async function peer(id2) {
    if (!identifier(id2) || !id2.startsWith("ses_")) fail("invalid_session_id", { sessionID: id2 });
    const item = await session.get({ sessionID: id2 }).catch((error) => {
      if (!sessionNotFound(error, id2)) throw error;
    });
    if (item?.id !== id2 || !item.projectID || !item.location?.directory) fail("invalid_session", { sessionID: id2 });
    return item;
  }
  async function peers() {
    const result = [], cursors = /* @__PURE__ */ new Set();
    let cursor;
    for (let page = 0; page < 1e3; page++) {
      const response2 = await session.list(cursor ? { limit: 100, cursor } : { limit: 100, order: "desc" });
      if (!Array.isArray(response2?.data) || !response2.cursor) fail("invalid_discovery_response");
      result.push(...response2.data);
      for (const item of response2.data) if (item.title) titles2.set(item.id, item.title);
      cursor = response2.cursor.next;
      if (!cursor || response2.data.length === 0) return result;
      if (cursors.has(cursor)) fail("repeated_discovery_cursor");
      cursors.add(cursor);
    }
    fail("discovery_page_limit");
  }
  function removeDeleted(state, deleted) {
    const teams = Object.values(state.teams).filter((team) => team.members.some((id2) => deleted.includes(id2)));
    for (const team of teams) {
      for (const id2 of team.members.filter((id3) => deleted.includes(id3))) {
        const name = state.profiles[id2]?.name ?? titles2.get(id2);
        audit(state, "system", "team.member.removed", { teamID: team.id, teamName: team.name, sessionID: id2, ...name ? { name } : {} });
      }
      team.members = team.members.filter((id2) => !deleted.includes(id2));
      if (!team.members.length) {
        delete state.teams[team.id];
        historyOf(state).forget(team.id);
        audit(state, "system", "team.removed", { teamID: team.id, teamName: team.name }, [GENERAL]);
      }
    }
    if (teams.length) state.revision++;
    let forgotten = false;
    for (const id2 of deleted) {
      titles2.delete(id2);
      for (const records of [state.created, state.profiles, state.discovery.registrations]) {
        if (Object.hasOwn(records, id2)) {
          delete records[id2];
          forgotten = true;
        }
      }
    }
    return teams.length > 0 || forgotten;
  }
  async function confirmedDeleted(id2) {
    try {
      await session.get({ sessionID: id2 });
      return false;
    } catch (error) {
      return sessionNotFound(error, id2);
    }
  }
  async function reconcileState(state, list, everything = false) {
    const listed = new Set(list.map((item) => item.id));
    const absent = [.../* @__PURE__ */ new Set([
      ...Object.values(state.teams).flatMap((team) => team.members),
      ...Object.keys(state.created),
      ...everything ? [...Object.keys(state.profiles), ...Object.keys(state.discovery.registrations)] : []
    ])].filter((id2) => !listed.has(id2));
    if (!absent.length) return;
    const confirmed = await Promise.all(absent.map(confirmedDeleted));
    if (removeDeleted(state, absent.filter((_2, index) => confirmed[index]))) await save(state);
  }
  async function reconcile() {
    const list = await peers();
    return queue2(async () => {
      const state = await load();
      await reconcileState(state, list, true);
      await historyOf(state).repair();
      await save(state);
    });
  }
  async function sessionDeleted(id2) {
    return queue2(async () => {
      const state = await load();
      if (removeDeleted(state, [id2])) await save(state);
    });
  }
  function authorized(state, from, to) {
    if (projectKey(from) === projectKey(to)) return true;
    if (Object.values(state.teams).some((team) => team.members.includes(from.id) && team.members.includes(to.id))) return true;
    return Object.values(state.connections).some((connection) => !connection.closed && connection.expiresAt > now() && connection.members.includes(from.id) && connection.members.includes(to.id));
  }
  async function catalogFor(directory) {
    if (!catalog) return void 0;
    try {
      const [agents, models] = await Promise.all([catalog.agents(directory), catalog.models(directory)]);
      return { agents, models };
    } catch {
      return void 0;
    }
  }
  function countedSessions(list, state) {
    return list.filter((item) => managed(item, state)).map((item) => ({
      sessionID: item.id,
      name: identity(item, state).name,
      registered: Object.hasOwn(state.discovery.registrations, item.id),
      lastActive: new Date(Math.max(
        millis(item.time?.updated),
        millis(item.time?.busy),
        millis(item.time?.idle),
        millis(item.time?.created)
      )).toISOString()
    }));
  }
  return { peer, peers, reconcileState, reconcile, sessionDeleted, authorized, catalogFor, countedSessions };
}

// src/engine/snapshot.js
var AGENT_MESSAGES = 50;
var AGENT_ACTIVITY = 50;
var AGENT_MESSAGE_BYTES = 64 * 1024;
var AGENT_PEERS = 100;
function createViews({
  limits,
  now,
  queue: queue2,
  attention: attention2,
  store: { load, save, historyOf },
  sessions: { peer, peers, reconcileState, catalogFor, countedSessions }
}) {
  function selfOf(item, state, list) {
    const recent = (state.rate[item.id] ?? []).filter((at) => at > now() - 6e4);
    return {
      ...identity(item, state),
      capabilities: clone(state.capabilities),
      quota: { managedSessions: ((counted) => ({
        used: counted.length,
        limit: limits.managedSessions,
        unlisted: counted.filter((entry) => !isListed(state, entry.sessionID)).length
      }))(countedSessions(list, state)) },
      messages: { perMinuteRemaining: Math.max(0, limits.messagesPerMinute - recent.length), perMinute: limits.messagesPerMinute }
    };
  }
  async function snapshot(actor, viewer, options2 = {}) {
    const self = actor === void 0 ? void 0 : await peer(actor);
    const list = await peers();
    const running = (item) => millis(item.time?.busy) > millis(item.time?.idle);
    await attention2?.refresh(list.filter(running).map((item) => item.id));
    const blockedOn = (item) => {
      const reason = running(item) ? attention2?.of(item.id) : void 0;
      return reason ? { waitingFor: reason } : {};
    };
    const found = options2.catalog && self ? await catalogFor(self.location.directory) : void 0;
    return queue2(async () => {
      const state = await load();
      await reconcileState(state, list);
      await save(state);
      const listed = (item) => listedSession(state, item);
      const shown = list.filter((item) => listed(item) && !item.time?.archived);
      const forAgent = (rows, row2) => ({
        agents: rows.slice(0, AGENT_PEERS).map(row2),
        ...rows.length > AGENT_PEERS ? { agentsOmitted: rows.length - AGENT_PEERS } : {}
      });
      if (options2.scope !== void 0 && !identifier(options2.scope)) fail("invalid_action_input");
      const connections = Object.values(state.connections).map((item) => ({ ...item, active: !item.closed && item.expiresAt > now() }));
      const agentSelf = () => self ? { self: {
        ...selfOf(self, state, list),
        ...options2.catalog ? { catalog: found ?? { unavailable: true } } : {}
      } } : {};
      if (options2.compact && self) {
        const mine = (item) => item.members.includes(actor);
        const scopes2 = [...Object.values(state.teams).filter(mine).map((team) => team.id), NO_TEAM];
        const waiting = /* @__PURE__ */ new Set();
        let filled = false;
        for (const id2 of scopes2) {
          const saved = state.unacknowledged[id2];
          if (saved === null || saved === void 0 && state.counts[id2]?.messages) {
            state.unacknowledged[id2] = unacknowledged(await historyOf(state).scope(id2));
            filled = true;
          }
          for (const message of state.unacknowledged[id2]?.[actor] ?? []) waiting.add(message);
        }
        for (const receipt of Object.values(state.receipts)) {
          if (receipt.to === actor && ["accepted", "delivered"].includes(receipt.status)) waiting.add(receipt.id);
        }
        if (filled) await save(state);
        return {
          ...agentSelf(),
          revision: state.revision,
          discovery: { mode: state.discovery.mode },
          ...forAgent(shown.filter((item) => item.id !== actor), (item) => {
            const peerIdentity = identity(item, state);
            return {
              sessionID: peerIdentity.sessionID,
              name: peerIdentity.name,
              role: peerIdentity.role,
              directory: peerIdentity.directory,
              activity: peerIdentity.activity,
              ...blockedOn(item)
            };
          }),
          teams: Object.values(state.teams).filter(mine),
          connections: connections.filter((item) => item.active && mine(item)),
          unacknowledged: [...waiting]
        };
      }
      const wanted = actor !== void 0 ? [...Object.values(state.teams).filter((team) => team.members.includes(actor)).map((team) => team.id), NO_TEAM, GENERAL] : options2.scope !== void 0 ? [options2.scope] : Object.keys(state.counts);
      const histories = await Promise.all(wanted.map((id2) => historyOf(state).scope(id2)));
      let messages = histories.flatMap((history) => Object.values(history.messages)).filter((item) => actor === void 0 || item.from === actor || item.to === actor);
      const seen = /* @__PURE__ */ new Set();
      let audit = histories.flatMap((history) => history.audit).filter((item) => {
        if (actor !== void 0 && item.actor !== actor) return false;
        if (histories.length === 1) return true;
        const key = JSON.stringify(item);
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      }).sort((a, b) => a.at - b.at);
      messages.sort((a, b) => a.at - b.at);
      const scopes = actor === void 0 ? historyCounts(state) : void 0;
      let messagesOmitted;
      if (actor === void 0) {
        const limit = Number.isSafeInteger(options2.limit) && options2.limit > 0 ? options2.limit : RECENT_RECORDS;
        messages = messages.slice(-limit);
        audit = audit.slice(-limit);
      } else {
        const total2 = messages.length;
        let bytes = 0, kept = 0;
        for (const message of messages.slice(-AGENT_MESSAGES).reverse()) {
          bytes += Buffer.byteLength(JSON.stringify(message), "utf8");
          if (kept && bytes > AGENT_MESSAGE_BYTES) break;
          kept++;
        }
        messages = messages.slice(-kept || total2);
        messagesOmitted = total2 - messages.length;
        audit = audit.slice(-AGENT_ACTIVITY);
      }
      const visible = (item) => actor === void 0 || item.members.includes(actor);
      const ownTeams = Object.values(state.teams).filter(visible), visibleConnections = connections.filter(visible);
      const listedIDs = new Set(list.filter(listed).map((item) => item.id));
      const visibleTeams = actor === void 0 ? ownTeams : Object.values(state.teams).map((team) => visible(team) ? team : { id: team.id, name: team.name, members: team.members.filter((id2) => listedIDs.has(id2)), membersShown: "listed" });
      const referenced = /* @__PURE__ */ new Set([
        ...ownTeams.flatMap((item) => item.members),
        ...visibleConnections.flatMap((item) => item.members),
        ...messages.flatMap((item) => [item.from, item.to]),
        ...audit.flatMap((item) => [item.actor, item.data?.to, item.data?.sessionID]),
        ...typeof viewer === "string" ? [viewer] : []
      ]);
      const row = (item) => ({ ...identity(item, state), ...blockedOn(item) });
      const agentRows = actor === void 0 ? { agents: shown.map(row) } : forAgent(shown, row);
      const inAgents = new Set(agentRows.agents.map((item) => item.sessionID));
      const people = Object.fromEntries(list.filter((item) => referenced.has(item.id) && !inAgents.has(item.id)).map((item) => [item.id, identity(item, state)]));
      return {
        ...agentSelf(),
        revision: state.revision,
        capabilities: clone(state.capabilities),
        limits,
        discovery: { mode: state.discovery.mode, registered: Object.keys(state.discovery.registrations) },
        ...agentRows,
        people,
        teams: visibleTeams,
        connections: visibleConnections,
        messages,
        audit,
        ...scopes ? { scopes } : { messagesOmitted }
      };
    });
  }
  async function teamCandidates(input = {}) {
    if (!input || typeof input !== "object" || Array.isArray(input) || Object.keys(input).some((key) => !["query", "page", "exclude"].includes(key)) || input.query !== void 0 && (typeof input.query !== "string" || input.query.length > 240) || input.exclude !== void 0 && (!Array.isArray(input.exclude) || input.exclude.length > 32 || input.exclude.some((id2) => !identifier(id2))) || input.page !== void 0 && (!Number.isSafeInteger(input.page) || input.page < 0)) fail("invalid_action_input");
    const list = await peers();
    return queue2(async () => {
      const state = await load(), query = (input.query ?? "").trim().toLowerCase();
      const rows = list.filter((item) => !item.time?.archived && !input.exclude?.includes(item.id) && listedSession(state, item)).map((item) => identity(item, state)).filter((item) => !query || [item.name, item.role, item.directory, item.sessionID].some((value) => value.toLowerCase().includes(query)));
      const page = Math.min(input.page ?? 0, Math.max(0, Math.ceil(rows.length / 50) - 1));
      return { items: rows.slice(page * 50, (page + 1) * 50), total: rows.length, page };
    });
  }
  return { snapshot, teamCandidates };
}

// src/engine/messages.js
import { createHash } from "node:crypto";
var hash = (value) => createHash("sha256").update(JSON.stringify(value)).digest("hex");
function createMessaging({
  session,
  limits,
  now,
  uuid,
  messageID,
  queue: queue2,
  store: { load, save, historyOf, audit },
  sessions: { peer, authorized }
}) {
  function checkMessage(state, from, to, input, parent, history) {
    if (from.id === to.id) fail("self_message");
    if (!authorized(state, from, to)) fail("communication_not_authorized", { to: to.id });
    if (to.time?.archived) fail("recipient_archived", { to: to.id });
    if (!identifier(input.key)) fail("invalid_idempotency_key", {
      field: "key",
      remedy: "Use 1-160 letters, digits, underscores, periods, colons or hyphens."
    });
    if (typeof input.text !== "string" || !input.text.trim() || Buffer.byteLength(input.text, "utf8") > limits.messageBytes)
      fail("invalid_message_size", {
        field: "text",
        limitBytes: limits.messageBytes,
        remedy: `Send nonblank text of at most ${limits.messageBytes} UTF-8 bytes.`
      });
    if (input.replyTo !== void 0 && (!parent || parent.to !== from.id || parent.from !== to.id || !["accepted", "delivered", "processed"].includes(parent.status))) fail("invalid_reply", { replyTo: input.replyTo });
    const conversationID = parent?.conversationID ?? `conversation_${uuid()}`;
    const hops = parent ? parent.hops + 1 : 0;
    const teammates = Object.values(state.teams).some((team) => team.members.includes(from.id) && team.members.includes(to.id));
    if (!teammates && hops > limits.maxHops) fail("hop_limit", { limit: limits.maxHops });
    if (!teammates && (history.conversations[conversationID] ?? 0) >= limits.messagesPerConversation)
      fail("conversation_limit", { limit: limits.messagesPerConversation });
    return { conversationID, hops, parent };
  }
  async function send(actor, input, signal) {
    return queue2(async () => {
      if (signal?.aborted) fail("cancelled");
      const state = await load();
      const [from, to] = await Promise.all([peer(actor), peer(input.to)]);
      const digest = hash([actor, input.to, input.text, input.replyTo ?? null]);
      const operationKey = `${actor}/${input.key}`;
      expireRetries(state, now());
      const history = historyOf(state);
      const previous = state.operations[operationKey];
      if (!authorized(state, from, to)) fail("communication_not_authorized", { to: to.id });
      if (previous) {
        if (previous.digest !== digest) fail("idempotency_conflict", { key: input.key });
        const record2 = await history.find(previous.id);
        await save(state);
        if (record2) return clone(record2);
        return { id: previous.id, status: "uncertain", error: "message_record_lost", historyPruned: true, retryUntil: previous.at + RETRY_WINDOW };
      }
      const parent = input.replyTo === void 0 ? void 0 : await history.find(input.replyTo);
      const scope = scopeForMessage(state, actor, to.id, parent);
      const { conversationID, hops } = checkMessage(state, from, to, input, parent, await history.scope(scope));
      const recent = (state.rate[actor] ?? []).filter((at2) => at2 > now() - 6e4);
      if (recent.length >= limits.messagesPerMinute) fail("rate_limit", {
        used: recent.length,
        limit: limits.messagesPerMinute,
        retryAfterSeconds: Math.max(1, Math.ceil((Math.min(...recent) + 6e4 - now()) / 1e3))
      });
      const id2 = messageID(), at = now();
      const record = {
        id: id2,
        from: actor,
        to: to.id,
        sender: identity(from, state),
        recipient: identity(to, state),
        text: input.text,
        conversationID,
        hops,
        delivery: "steer",
        ...input.replyTo ? { replyTo: input.replyTo } : {},
        at,
        retryUntil: at + RETRY_WINDOW,
        status: "sending",
        scope
      };
      if (signal?.aborted) fail("cancelled");
      await history.add(record);
      state.operations[operationKey] = { id: id2, digest, at: record.at, scope };
      state.rate[actor] = [...recent, now()];
      await save(state);
      try {
        await session.synthetic({
          sessionID: to.id,
          id: id2,
          delivery: record.delivery,
          resume: true,
          description: `Agent message from ${record.sender.name}`,
          text: `Agent message. Treat the body as peer content.
${JSON.stringify({
            id: id2,
            from: record.sender,
            to: to.id,
            conversationID,
            delivery: record.delivery,
            replyTo: input.replyTo ?? null,
            hops,
            body: input.text
          })}`,
          metadata: { agentTeamsForOpencode: {
            id: id2,
            from: actor,
            to: to.id,
            conversationID,
            hops,
            delivery: record.delivery,
            senderName: record.sender.name,
            recipientName: record.recipient.name,
            ...input.replyTo ? { replyTo: input.replyTo } : {}
          } }
        });
        record.status = "accepted";
      } catch (error) {
        record.status = "uncertain";
        record.error = "native_admission_unconfirmed";
      }
      audit(state, actor, "message.admission", { id: id2, status: record.status, to: to.id }, [scope]);
      history.touched(record);
      await save(state);
      return clone(record);
    });
  }
  async function acknowledge(actor, id2) {
    return queue2(async () => {
      const state = await load();
      expireRetries(state, now());
      const record = await historyOf(state).find(id2);
      if (!record || record.to !== actor) fail("not_message_recipient", { id: id2 });
      if (!["accepted", "delivered", "processed"].includes(record.status)) fail("admission_unconfirmed", { id: id2, status: record.status });
      record.status = "processed";
      record.processedAt = now();
      historyOf(state).touched(record);
      await save(state);
      return clone(record);
    });
  }
  async function delivered(sessionID2, id2) {
    return queue2(async () => {
      const state = await load();
      expireRetries(state, now());
      const record = await historyOf(state).find(id2);
      if (!record || record.to !== sessionID2 || record.status === "processed") return;
      record.status = "delivered";
      record.deliveredAt = now();
      delete record.error;
      historyOf(state).touched(record);
      await save(state);
    });
  }
  return { send, acknowledge, delivered };
}

// src/engine/manage.js
var USER_ACTIONS = Object.freeze(Object.keys(ACTIONS).filter((action) => !["policy.update", "discovery.update"].includes(action)));
var readable = (value) => String(value).replace(/[\p{Cc}\p{Cf}\u2028\u2029]/gu, "");
function createManagement({
  session,
  approve,
  limits,
  now,
  uuid,
  sessionID: sessionID2,
  queue: queue2,
  store: { load, save, historyOf, audit, mergeCapabilities },
  sessions: { peer, peers, catalogFor, countedSessions }
}) {
  function categories(action, state, members, user, places = members) {
    if (user) return [];
    if (action === "policy.update") return ["policy"];
    if (action === "discovery.update") return ["discovery"];
    const result = [];
    if (action === "session.create") result.push("createSession");
    if (action === "session.create" && members) result.push("changeMembers");
    if (action === "team.create") result.push("createTeam", "changeMembers");
    if (["team.members", "team.delete"].includes(action)) result.push("changeMembers");
    if (action === "connection.create") result.push("openConnection");
    if (action === "connection.extend") result.push("extendConnection");
    if (places && new Set(places.map(projectKey)).size > 1) result.push("workAcrossProjects");
    const needed = [...new Set(result)];
    const denied = needed.filter((item) => state.capabilities[item] === "deny");
    if (denied.length) fail("capability_denied", {
      action,
      denied,
      remedy: "A user can allow these in Settings \u2192 Agent Teams, or request a change with manage policy.update (needs approval)."
    });
    return needed.filter((item) => state.capabilities[item] === "ask");
  }
  function invalidInput(action, missing, invalid, hint = hintFor(action)) {
    fail("invalid_action_input", { action, missing, invalid, hint });
  }
  async function catalogProblems(input, directory) {
    const found = await catalogFor(directory);
    if (!found) return { invalid: [], hints: [] };
    const invalid = [], hints = [];
    const agents = found.agents.map((item) => item.id);
    if (agents.length) {
      hints.push(`agent must be one of: ${agents.join(", ")}`);
      if (input.agent !== void 0 && !agents.includes(input.agent)) invalid.push({ field: "agent", reason: "is not an available agent", allowed: agents });
    }
    if (found.models.length) {
      const sample = found.models.slice(0, 20).map((item) => `${item.providerID}/${item.id}`);
      hints.push(`model is {providerID,id}, for example: ${sample.join(", ")}${found.models.length > sample.length ? " (call discover with catalog:true for all)" : ""}`);
      const model = input.model && typeof input.model === "object" ? found.models.find((item) => item.providerID === input.model.providerID && item.id === input.model.id) : void 0;
      if (input.model?.providerID !== void 0 && input.model?.id !== void 0 && !model)
        invalid.push({ field: "model", reason: "is not an enabled chat model for this directory" });
      if (model && input.model.variant !== void 0 && model.variants?.length && !model.variants.includes(input.model.variant))
        invalid.push({ field: "model.variant", reason: "is not a variant of this model", allowed: model.variants });
    }
    return { invalid, hints };
  }
  async function prepare(actor, action, input, state, user) {
    const self = await peer(actor);
    if (!Object.hasOwn(ACTIONS, action)) fail("unknown_action", { action, allowed: Object.keys(ACTIONS) });
    if (user && !USER_ACTIONS.includes(action)) fail("unknown_action", { action, allowed: [...USER_ACTIONS] });
    const shape = validateInput(action, input, limits);
    if (action === "session.create" && input && typeof input === "object" && !Array.isArray(input)) {
      const usable = typeof input.directory === "string" && !shape.invalid.some((item) => item.field === "directory");
      const extra = await catalogProblems(
        usable ? input : { ...input, agent: void 0, model: void 0 },
        usable ? input.directory : self.location.directory
      );
      shape.invalid.push(...extra.invalid);
      if (shape.missing.length || shape.invalid.length) invalidInput(
        action,
        shape.missing,
        shape.invalid,
        [...extra.hints, hintFor(action)].join("; ")
      );
    }
    if (shape.missing.length || shape.invalid.length) invalidInput(action, shape.missing, shape.invalid);
    let members, places;
    if (["team.create", "team.members", "connection.create"].includes(action)) {
      if (!input.members.includes(actor)) invalidInput(action, [], [{ field: "members", reason: "must include the acting session", sessionID: actor }]);
      members = await Promise.all(input.members.map(peer));
    }
    if (action.startsWith("team.") && action !== "team.create" && (!Object.hasOwn(state.teams, input.id) || !state.teams[input.id].members.includes(actor))) fail("team_not_found", { teamID: input.id });
    if (action === "team.create" && Object.values(state.teams).some((team) => nameKey(team.name) === nameKey(input.name)))
      fail("team_name_exists", { name: input.name.trim() });
    if (["team.create", "team.members", "connection.create"].includes(action) && state.discovery.mode !== "automatic") {
      const kept = action === "team.members" ? state.teams[input.id].members : [];
      const unregistered = input.members.filter((id2) => !kept.includes(id2) && !Object.hasOwn(state.discovery.registrations, id2));
      if (unregistered.length) fail("member_not_registered", {
        sessions: unregistered,
        names: members.filter((item) => unregistered.includes(item.id)).map((item) => identity(item, state).name)
      });
    }
    if (action.startsWith("connection.") && action !== "connection.create") {
      const connection = Object.hasOwn(state.connections, input.id) ? state.connections[input.id] : void 0;
      if (!connection || !connection.members.includes(actor)) fail("connection_not_found", { connectionID: input.id });
      if (action === "connection.extend" && (connection.closed || connection.expiresAt <= now())) fail("connection_expired", { connectionID: input.id });
      if (action === "connection.extend") members = await Promise.all(connection.members.map(peer));
    }
    if (action === "session.create") {
      const list = await peers();
      const counted = countedSessions(list, state);
      if (input.teamID === void 0 && counted.length >= limits.managedSessions) {
        const shown = counted.filter((item) => isListed(state, item.sessionID));
        fail("session_creation_limit", {
          used: counted.length,
          limit: limits.managedSessions,
          counted: shown,
          countedUnlisted: counted.length - shown.length,
          remedy: "Archive a counted session, add it to a team, or ask the operator to raise options.limits.managedSessions in this plugin's opencode.json(c) entry. Unlisted sessions are counted but not named. Ask the user about them."
        });
      }
      const target = list.find((item) => folderKey(item.location.directory) === folderKey(input.directory)) ?? (within(input.directory, self.location.directory) ? self : { projectID: "global", location: { directory: input.directory } });
      if (input.teamID === void 0) places = [self, target];
      if (input.teamID !== void 0) {
        const team = Object.hasOwn(state.teams, input.teamID) ? state.teams[input.teamID] : void 0;
        if (!team || !team.members.includes(actor)) fail("team_not_found", { teamID: input.teamID });
        if (team.members.length >= 32) fail("team_full", { teamID: input.teamID, limit: 32, remedy: "Remove a member or use another team." });
        members = [...await Promise.all(team.members.map(peer)), target];
      }
    }
    if (action === "policy.update") mergeCapabilities(state.capabilities, input.capabilities);
    return categories(action, state, members, user, places ?? members);
  }
  async function describe(actor, action, input, state) {
    const nameOf = (item) => {
      const name = identity(item, state).name;
      return name === item.id ? "an untitled session" : name;
    };
    const who = async (ids) => (await Promise.all(ids.map((id2) => peer(id2).catch(() => void 0)))).map((item) => item ? `${nameOf(item)} (${readable(item.location.directory)})` : "a session that no longer exists");
    const team = (id2) => `"${cleanLabel(state.teams[id2]?.name ?? "")}"`;
    const minutes = `${input.minutes ?? limits.connectionMinutes} minutes`;
    const sessions2 = (count) => count === 1 ? "1 session" : `${count} sessions`;
    const lines = {
      "team.create": async () => [`create the team "${cleanLabel(input.name)}" with ${sessions2(input.members.length)}:`, ...await who(input.members)],
      "team.members": async () => {
        const current = state.teams[input.id].members;
        const added = input.members.filter((id2) => !current.includes(id2)), removed2 = current.filter((id2) => !input.members.includes(id2));
        return [
          `change the members of ${team(input.id)}:`,
          ...(await who(added)).map((text) => `Add: ${text}`),
          ...(await who(removed2)).map((text) => `Remove: ${text}`)
        ];
      },
      "team.delete": async () => [`delete the team ${team(input.id)} and its message history`],
      "connection.create": async () => [`connect ${sessions2(input.members.length)} for ${minutes}:`, ...await who(input.members)],
      "connection.extend": async () => [`extend a connection so it ends in ${minutes}:`, ...await who(state.connections[input.id].members)],
      "session.create": async () => [
        "create a session:",
        `Name: "${cleanLabel(input.name)}"`,
        `Role: ${cleanLabel(input.role)}`,
        `Folder: ${readable(input.directory)}`,
        `OpenCode agent: ${readable(input.agent)}`,
        `Model: ${readable(input.model.providerID)}/${readable(input.model.id)}${input.model.variant ? ` (${readable(input.model.variant)})` : ""}`,
        ...input.teamID !== void 0 ? [`Team: ${team(input.teamID)}`] : []
      ],
      "policy.update": async () => ["change agent permissions:", ...Object.entries(input.capabilities).map(([key, value]) => `${key}: ${value}`)],
      "discovery.update": async () => [input.mode === "automatic" ? "list every session automatically" : "list only sessions that join the list"]
    }[action];
    const [headline, ...rest] = lines ? await lines() : [action];
    const first = `${nameOf(await peer(actor))} asks to ${headline}`;
    return [first[0].toUpperCase() + first.slice(1), ...rest];
  }
  const recentOf = (state, actor) => (state.rate[actor] ?? []).filter((at) => at > now() - 6e4);
  async function manage(actor, action, input = {}, signal, { user = false } = {}) {
    const proposal = clone(input);
    const baseline = await queue2(async () => {
      const state = await load();
      const categories2 = await prepare(actor, action, proposal, state, user);
      const recent = recentOf(state, actor);
      if (!user && recent.length >= limits.messagesPerMinute) fail("rate_limit", {
        used: recent.length,
        limit: limits.messagesPerMinute,
        retryAfterSeconds: Math.max(1, Math.ceil((Math.min(...recent) + 6e4 - now()) / 1e3))
      });
      return {
        revision: state.revision,
        categories: categories2,
        summary: categories2.length ? await describe(actor, action, proposal, state) : void 0
      };
    });
    if (signal?.aborted) fail("cancelled");
    if (baseline.categories.length) await approve(actor, action, proposal, baseline.categories, baseline.summary);
    if (signal?.aborted) fail("cancelled");
    return queue2(async () => {
      if (signal?.aborted) fail("cancelled");
      const state = await load();
      if (state.revision !== baseline.revision) fail("state_changed_request_again");
      const required = await prepare(actor, action, proposal, state, user);
      if (signal?.aborted) fail("cancelled");
      if (required.length !== baseline.categories.length || required.some((category) => !baseline.categories.includes(category)))
        fail("state_changed_request_again", { approved: baseline.categories, required });
      let result;
      if (action === "connection.close" && state.connections[proposal.id].closed) return clone(state.connections[proposal.id]);
      const extendedTo = now() + (proposal.minutes ?? limits.connectionMinutes) * 6e4;
      if (action === "connection.extend" && state.connections[proposal.id].expiresAt >= extendedTo) return clone(state.connections[proposal.id]);
      if (action === "team.members" && state.teams[proposal.id].members.length === proposal.members.length && proposal.members.every((id2) => state.teams[proposal.id].members.includes(id2))) return clone(state.teams[proposal.id]);
      const selfOnly = ["discovery.register", "discovery.unregister", "profile.update"].includes(action);
      if (selfOnly) {
        const registered = Object.hasOwn(state.discovery.registrations, actor);
        if (action === "discovery.register" && registered) return { registered: true };
        if (action === "discovery.unregister" && !registered) return { registered: false };
        if (action === "profile.update") {
          const current = identity(await peer(actor), state);
          const next = { name: (proposal.name ?? current.name).trim(), role: (proposal.role ?? current.role).trim() };
          const saved = state.profiles[actor];
          if (saved && saved.name === next.name && saved.role === next.role) return clone(saved);
        }
      }
      if (action === "discovery.register") {
        state.discovery.registrations[actor] = true;
        result = { registered: true };
      }
      if (action === "discovery.unregister") {
        delete state.discovery.registrations[actor];
        result = { registered: false };
      }
      if (action === "discovery.update") {
        state.discovery.mode = proposal.mode;
        result = { mode: proposal.mode };
      }
      let previousName;
      if (action === "profile.update") {
        const current = identity(await peer(actor), state);
        previousName = current.name;
        result = state.profiles[actor] = { name: (proposal.name ?? current.name).trim(), role: (proposal.role ?? current.role).trim() };
      }
      if (action === "team.create") {
        const id2 = `team_${uuid()}`;
        result = state.teams[id2] = { id: id2, name: proposal.name.trim(), members: proposal.members };
      }
      if (action === "team.members") {
        state.teams[proposal.id].members = proposal.members;
        result = state.teams[proposal.id];
      }
      const teamName = action === "team.delete" ? state.teams[proposal.id].name : void 0;
      if (action === "team.delete") {
        delete state.teams[proposal.id];
        historyOf(state).forget(proposal.id);
        result = { deleted: proposal.id };
      }
      if (action === "connection.create") {
        const id2 = `connection_${uuid()}`;
        result = state.connections[id2] = {
          id: id2,
          members: proposal.members,
          createdAt: now(),
          expiresAt: now() + (proposal.minutes ?? limits.connectionMinutes) * 6e4
        };
      }
      if (action === "connection.extend") {
        result = state.connections[proposal.id];
        result.expiresAt = extendedTo;
      }
      if (action === "connection.close") {
        result = state.connections[proposal.id];
        result.closed = true;
        result.closedAt = now();
      }
      if (action === "policy.update") result = state.capabilities = mergeCapabilities(state.capabilities, proposal.capabilities);
      if (action === "session.create") {
        const id2 = sessionID2();
        audit(state, actor, "session.create.intent", { id: id2, proposal });
        state.created[id2] = true;
        await save(state);
        if (signal?.aborted) {
          audit(state, actor, "session.create.cancelled", {
            id: id2,
            reason: "cancelled_before_native_dispatch",
            ...proposal.teamID ? { teamID: proposal.teamID } : {}
          });
          delete state.created[id2];
          await save(state);
          fail("cancelled");
        }
        result = await session.create({
          id: id2,
          title: proposal.name,
          agent: proposal.agent,
          model: proposal.model,
          location: { directory: proposal.directory }
        });
        state.profiles[result.id] = { name: proposal.name, role: proposal.role };
        state.discovery.registrations[result.id] = true;
        if (proposal.teamID !== void 0) state.teams[proposal.teamID].members.push(result.id);
      }
      if (!user) state.rate[actor] = [...recentOf(state, actor), now()];
      if (!selfOnly) state.revision++;
      audit(state, actor, action, {
        proposal,
        ...user ? { userAction: true, ...previousName ? { previousName } : {} } : { approvalCategories: baseline.categories },
        ...action === "team.create" ? { teamID: result.id } : {},
        ...teamName ? { teamName } : {},
        ...action === "profile.update" ? { profile: clone(result) } : {}
      }, action === "team.delete" ? [GENERAL] : void 0);
      await save(state);
      return clone(result);
    });
  }
  return { manage };
}

// src/engine/user.js
var label2 = isLabel;
function createUserControls({ uuid, queue: queue2, store: { load, save, historyOf, audit }, sessions: { peer } }) {
  async function teamManage(action, input, revision) {
    const proposal = clone(input);
    return queue2(async () => {
      const state = await load();
      if (!Number.isSafeInteger(revision) || revision !== state.revision) fail("state_changed_request_again");
      if (!["team.create", "team.update", "team.delete"].includes(action) || !proposal || typeof proposal !== "object" || Array.isArray(proposal))
        fail("invalid_action_input");
      const fields = action === "team.create" ? ["name", "members"] : action === "team.update" ? ["id", "name", "members"] : ["id"];
      if (Object.keys(proposal).some((key) => !fields.includes(key))) fail("invalid_action_input");
      if (action !== "team.create" && (!identifier(proposal.id) || !Object.hasOwn(state.teams, proposal.id))) fail("team_not_found");
      if (action !== "team.delete") {
        if (!label2(proposal.name)) fail("invalid_team_name");
        if (Object.values(state.teams).some((team) => team.id !== proposal.id && nameKey(team.name) === nameKey(proposal.name))) fail("team_name_exists");
        if (!Array.isArray(proposal.members) || proposal.members.length < 1 || proposal.members.length > 32 || new Set(proposal.members).size !== proposal.members.length) fail("invalid_members");
        const members = await Promise.all(proposal.members.map(peer));
        if (members.some((item) => item.time?.archived && !state.teams[proposal.id]?.members.includes(item.id))) fail("invalid_session");
        if (state.discovery.mode !== "automatic" && proposal.members.some((id2) => !state.teams[proposal.id]?.members.includes(id2) && !Object.hasOwn(state.discovery.registrations, id2))) fail("member_not_registered");
      }
      let result;
      const teamName = action === "team.delete" ? state.teams[proposal.id].name : void 0;
      if (action === "team.delete") {
        delete state.teams[proposal.id];
        historyOf(state).forget(proposal.id);
        result = { deleted: proposal.id };
      } else {
        const id2 = action === "team.create" ? `team_${uuid()}` : proposal.id;
        result = state.teams[id2] = { id: id2, name: proposal.name.trim(), members: proposal.members };
      }
      state.revision++;
      audit(
        state,
        "user",
        action,
        {
          proposal,
          userAction: true,
          ...action === "team.create" ? { teamID: result.id } : {},
          ...teamName ? { teamName } : {}
        },
        action === "team.delete" ? [GENERAL] : void 0
      );
      await save(state);
      return clone(result);
    });
  }
  async function profileManage(sessionID2, input, revision, signal) {
    const proposal = clone(input);
    return queue2(async () => {
      if (signal?.aborted) fail("cancelled");
      const state = await load();
      if (!Number.isSafeInteger(revision) || revision !== state.revision) fail("state_changed_request_again");
      if (!proposal || typeof proposal !== "object" || Array.isArray(proposal) || Object.keys(proposal).some((key) => !["name", "role"].includes(key)) || !isDisplayName(proposal.name) || !label2(proposal.role)) fail("invalid_profile");
      const target = await peer(sessionID2), previousName = identity(target, state).name;
      if (signal?.aborted) fail("cancelled");
      const result = state.profiles[target.id] = { name: proposal.name.trim(), role: proposal.role.trim() };
      state.revision++;
      audit(state, "user", "profile.update", { sessionID: target.id, previousName, proposal: result, userAction: true });
      await save(state);
      return clone(result);
    });
  }
  return { teamManage, profileManage };
}

// src/core.js
function createEngine({
  storage,
  session,
  approve,
  queue: queue2 = serialQueue(),
  now = Date.now,
  uuid = randomUUID,
  messageID = () => `msg_${uuid().replaceAll("-", "")}`,
  sessionID: sessionID2 = () => `ses_${uuid().replaceAll("-", "")}`,
  limits: configuredLimits,
  catalog,
  titles: titles2 = /* @__PURE__ */ new Map(),
  attention: attention2 = void 0
}) {
  const limits = limitsFrom(configuredLimits);
  const base = { storage, session, approve, queue: queue2, now, uuid, messageID, sessionID: sessionID2, limits, catalog, titles: titles2, attention: attention2 };
  const store = createStore(base);
  const sessions2 = createSessions({ ...base, store });
  const parts = { ...base, store, sessions: sessions2 };
  const { maintain, configuration, configure, removeData } = store;
  const { reconcile, sessionDeleted } = sessions2;
  return {
    ...createViews(parts),
    ...createMessaging(parts),
    ...createManagement(parts),
    ...createUserControls(parts),
    removeData,
    sessionDeleted,
    reconcile,
    maintain,
    limits,
    configuration,
    configure
  };
}

// src/rpc.js
import { Rpc } from "@opencode/plugin/rpc";
var Collaboration = Rpc.define(
  /** @type {const} */
  {
    id: "agent-teams-for-opencode",
    methods: {
      settings: { input: { type: "object", additionalProperties: false }, output: {} },
      configure: { input: {
        type: "object",
        properties: {
          command: { type: "string" },
          discoveryMode: { type: "string", enum: ["registered", "automatic"] },
          capabilities: { type: "object" }
        },
        minProperties: 1,
        maxProperties: 1,
        additionalProperties: false
      }, output: {} },
      snapshot: { input: {
        type: "object",
        properties: { sessionID: { type: "string" }, scope: { type: "string" }, limit: { type: "integer", minimum: 1 } },
        additionalProperties: false
      }, output: {} },
      removeData: { input: {
        type: "object",
        properties: { confirm: { type: "string", enum: ["remove-all-saved-data"] } },
        required: ["confirm"],
        additionalProperties: false
      }, output: {} },
      teamCandidates: { input: { type: "object", properties: {
        query: { type: "string", maxLength: 240 },
        page: { type: "integer", minimum: 0 },
        exclude: { type: "array", items: { type: "string" }, maxItems: 32 }
      }, additionalProperties: false }, output: {} },
      teamManage: { input: {
        type: "object",
        properties: {
          action: { type: "string", enum: ["team.create", "team.update", "team.delete"] },
          input: { type: "object" },
          revision: { type: "integer", minimum: 0 }
        },
        required: ["action", "input", "revision"],
        additionalProperties: false
      }, output: {} },
      profileManage: { input: {
        type: "object",
        properties: {
          sessionID: { type: "string" },
          input: {
            type: "object",
            properties: { name: { type: "string" }, role: { type: "string" } },
            required: ["name", "role"],
            additionalProperties: false
          },
          revision: { type: "integer", minimum: 0 }
        },
        required: ["sessionID", "input", "revision"],
        additionalProperties: false
      }, output: {} },
      manage: { input: { type: "object", properties: {
        sessionID: { type: "string" },
        action: { type: "string" },
        input: { type: "object" }
      }, required: ["sessionID", "action", "input"], additionalProperties: false }, output: {} }
    },
    events: {}
  }
);

// src/settings.js
var KEY2 = "collaboration.ui.v1";
var valid = (command) => typeof command === "string" && /^[a-z][a-z0-9-]{0,31}$/.test(command) && command !== "peers";
function createSettings(storage, queue2) {
  return {
    get: () => queue2(async () => {
      const value = await storage.get(KEY2);
      if (value === void 0) return { command: "team" };
      if (!value || !valid(value.command)) throw new Error("Invalid stored slash command setting.");
      return { command: value.command };
    }),
    set: (input) => queue2(async () => {
      const command = typeof input?.command === "string" ? input.command.trim().replace(/^\//, "").toLowerCase() : void 0;
      if (!valid(command) || Object.keys(input).some((key) => key !== "command")) {
        throw new Error("Use 1-32 letters, digits or hyphens. Start with a letter. The name peers is reserved.");
      }
      const value = { command };
      await storage.set(KEY2, value);
      return value;
    })
  };
}

// src/server.js
function refusal(error) {
  return { content: JSON.stringify({ error: error.toJSON() }), metadata: { error: error.toJSON() } };
}
function toolError(error) {
  const detail = {
    code: "unexpected_error",
    message: error instanceof Error ? error.message : String(error),
    remedy: "Inspect the message; retry only if the request is safe to repeat."
  };
  return new tool_exports.Error({ message: JSON.stringify(detail), metadata: detail });
}
function catalogOf(ctx) {
  if (typeof ctx.agent?.list !== "function" || typeof ctx.model?.list !== "function") return void 0;
  return {
    agents: async (directory) => (await ctx.agent.list({ location: { directory } })).data.filter((agent) => !agent.hidden && agent.mode !== "subagent").map((agent) => ({ id: agent.id, name: agent.name, ...agent.description ? { description: agent.description } : {} })),
    models: async (directory) => (await ctx.model.list({ location: { directory }, types: ["chat"] })).data.filter((model) => model.enabled !== false && (model.type === void 0 || model.type === "chat")).map((model) => ({
      providerID: model.providerID,
      id: model.id,
      name: model.name,
      variants: (model.variants ?? []).map((variant) => typeof variant === "string" ? variant : variant.id).filter(Boolean)
    }))
  };
}
var lockKey = /* @__PURE__ */ Symbol.for("agent-teams-for-opencode.queue.v1");
var queue = globalThis[lockKey] ??= serialQueue();
var titles = globalThis[/* @__PURE__ */ Symbol.for("agent-teams-for-opencode.titles.v1")] ??= /* @__PURE__ */ new Map();
var attention = globalThis[/* @__PURE__ */ Symbol.for("agent-teams-for-opencode.attention.v1")] ??= createAttention();
var maintenanceKey = /* @__PURE__ */ Symbol.for("agent-teams-for-opencode.maintenance.v1");
function startMaintenance(engine) {
  const shared = globalThis[maintenanceKey] ??= { members: /* @__PURE__ */ new Set(), timer: void 0 };
  const run = () => engine.maintain().catch((error) => console.error("agent-teams-for-opencode history cleanup failed", error));
  shared.members.add(run);
  if (!shared.timer) {
    shared.timer = setInterval(() => {
      void shared.members.values().next().value?.();
    }, 6e4);
    shared.timer.unref?.();
  }
  return () => {
    shared.members.delete(run);
    if (!shared.members.size) {
      clearInterval(shared.timer);
      shared.timer = void 0;
    }
  };
}
function verifyContext(ctx) {
  const version = /^(\d+)\.(\d+)\.(\d+)/.exec(ctx.app?.version ?? "");
  if (!version || Number(version[1]) !== 2 || Number(version[2]) < 2 || Number(version[2]) === 2 && Number(version[3]) < 5) throw new Error("OpenCode V2 2.2.5 or later is required");
  for (const [domain, methods] of Object.entries({
    session: ["list", "get", "create", "synthetic"],
    permission: ["assert", "hook"],
    storage: ["get", "set", "remove", "scan"],
    tool: ["transform"],
    rpc: ["register"],
    event: ["subscribe"]
  })) {
    for (const method of methods) if (typeof ctx[domain]?.[method] !== "function") throw new Error(`Missing V2 API: ${domain}.${method}`);
  }
}
var server_default = Plugin.define({
  id: "agent-teams-for-opencode",
  async setup(ctx) {
    verifyContext(ctx);
    const registrations = [], controller = new AbortController();
    const settings = createSettings(ctx.storage, queue);
    const engine = createEngine({
      storage: ctx.storage,
      session: ctx.session,
      queue,
      titles,
      messageID: () => session_message_exports.ID.create(),
      sessionID: () => session_exports.ID.create(),
      limits: ctx.options.limits,
      catalog: catalogOf(ctx),
      // Pending approvals are looked up through this instance, which is loaded while it asks.
      attention: { of: (id2) => attention.of(id2), refresh: (ids) => attention.refresh(
        ids,
        typeof ctx.permission.list === "function" ? (sessionID2) => ctx.permission.list({ sessionID: sessionID2 }) : void 0
      ) },
      // The prompt shows a summary with names and folders, never session IDs.
      approve: async (sessionID2, action, input, categories, summary) => {
        await ctx.permission.assert({
          sessionID: sessionID2,
          action: `agentTeamsForOpencode.approve.${categories.join("+")}`,
          resources: summary ?? [action],
          save: [],
          metadata: { action, summary, categories }
        });
      }
    });
    const stopMaintenance = startMaintenance(engine);
    const readSettings = async () => ({
      ...await settings.get(),
      .../** @type {{discoveryMode: string, capabilities: Record<string, string>}} */
      await engine.configuration()
    });
    try {
      registrations.push(await ctx.permission.hook("evaluate", (event) => {
        if (event.action.startsWith("agentTeamsForOpencode.approve.") && event.effect !== "deny") event.effect = "ask";
      }));
      registrations.push(await ctx.rpc.register(Collaboration, {
        settings: readSettings,
        configure: async (value) => {
          const input = (
            /** @type {Record<string, unknown>} */
            value
          );
          if (!input || Object.keys(input).length !== 1) throw new Error("invalid_setting");
          if (Object.hasOwn(input, "command")) await settings.set(input);
          else await engine.configure(input);
          return readSettings();
        },
        // An optional sessionID only adds that session's name to `people`.
        snapshot: (value) => {
          const input = (
            /** @type {{sessionID?: string, scope?: string, limit?: number}} */
            value
          );
          return engine.snapshot(void 0, input?.sessionID, { scope: input?.scope, limit: input?.limit });
        },
        removeData: (value) => engine.removeData(
          /** @type {{confirm: string}} */
          value?.confirm
        ),
        teamCandidates: (value) => engine.teamCandidates(value),
        teamManage: (value) => {
          const { action, input, revision } = (
            /** @type {{action: string, input: object, revision: number}} */
            value
          );
          return engine.teamManage(action, input, revision);
        },
        profileManage: (value, call) => {
          const { sessionID: sessionID2, input, revision } = (
            /** @type {{sessionID: string, input: object, revision: number}} */
            value
          );
          return engine.profileManage(sessionID2, input, revision, call?.signal);
        },
        manage: (value, call) => {
          const { sessionID: sessionID2, action, input } = (
            /** @type {{sessionID: string, action: string, input: object}} */
            value
          );
          return engine.manage(sessionID2, action, input, call.signal, { user: true });
        }
      }));
      registrations.push(await ctx.tool.transform((editor) => {
        editor.namespace({ name: "peers", description: "Discover sessions and collaborate with authorized peers." });
        const add = (name, description, input, run) => editor.add({
          name,
          description,
          input,
          options: { codemode: false },
          execute: async (value, context) => {
            try {
              return { content: JSON.stringify(await run(value, context)) };
            } catch (error) {
              if (error instanceof AgentTeamsError) return refusal(error);
              throw toolError(error);
            }
          }
        });
        const object2 = (properties) => ({ type: "object", properties, additionalProperties: false });
        const string = { type: "string" };
        add(
          "discover",
          "List discoverable sessions, teams, your connections and your messages. Teams you are not in show only their listed members (membersShown: listed). Ask one of them, or the user, to add you. self shows this session's capabilities (allow: proceeds, ask: needs human approval, deny: refused), managed-session quota (unlisted counts plugin sessions that left the list, which are not named) and remaining messages this minute. Sessions you create are listed straight away. messages holds your newest messages from your teams and connections, up to 50 and about 64 KiB, and messagesOmitted says how many older ones were left out. Each peer has activity (running or idle). waitingFor is set while a running peer waits for a person: approval (a permission prompt) or input (a question). That peer is blocked on the user, not on you, so tell the user rather than messaging it again. agents lists up to 100 listed, unarchived peers, newest first, and agentsOmitted counts the rest. compact:true returns only self, peers, own teams/connections and unacknowledged message IDs. catalog:true adds valid agent and model values for session.create. Registration is required by default: manage discovery.register with input {}. Discovery grants no access.",
          object2({
            compact: { type: "boolean", description: "Return a short summary." },
            catalog: { type: "boolean", description: "Include agents and models for session.create." }
          }),
          (input, context) => engine.snapshot(context.sessionID, void 0, { compact: input?.compact === true, catalog: input?.catalog === true })
        );
        add(
          "send",
          'Send a steering synthetic peer message. Steers busy recipients at their next step boundary and wakes idle recipients; does not cancel an in-flight model or tool call. Reuse key for immediate retries only: duplicate protection lasts 15 minutes from the first attempt, or until its team is deleted. After that the same key is a new send. Never force a retry of an uncertain admission; inspect the recipient first. Set replyTo for a reply. Returns admission status, not delivery or recipient acknowledgement. retryUntil reports the protection deadline. historyPruned:true means only the short-lived receipt remains. A refusal returns {"error":{code, remedy, ...}} and sends nothing.',
          { ...object2({ to: string, key: string, text: string, replyTo: string }), required: ["to", "key", "text"] },
          (input, context) => engine.send(context.sessionID, input, context.signal)
        );
        add(
          "acknowledge",
          "Mark a message addressed to this session as processed. Use only after reading and processing it.",
          { ...object2({ id: string }), required: ["id"] },
          (input, context) => engine.acknowledge(context.sessionID, input.id)
        );
        add(
          "manage",
          manageDescription(),
          manageSchema(engine.limits),
          (input, context) => engine.manage(context.sessionID, input.action, input.input, context.signal)
        );
      }));
      const events = (async () => {
        const stopListening = attention.listen();
        try {
          for await (const event of ctx.event.subscribe({ signal: controller.signal })) {
            attention.event(event);
            if (event.type === "session.inbox.delivered") await engine.delivered(event.data.sessionID, event.data.inboxID).catch((error) => console.error("agent-teams-for-opencode delivery update failed", error));
            if (event.type === "session.deleted") await engine.sessionDeleted(event.data.sessionID).catch((error) => console.error("agent-teams-for-opencode session removal failed", error));
          }
        } finally {
          stopListening();
        }
      })();
      events.catch((error) => {
        if (!controller.signal.aborted) console.error("agent-teams-for-opencode event subscription failed", error);
      });
      const reconciled = engine.reconcile().catch((error) => console.error("agent-teams-for-opencode session reconciliation failed", error));
      return async () => {
        stopMaintenance();
        controller.abort();
        await Promise.allSettled(registrations.reverse().map((item) => item.dispose()));
        await events.catch(() => {
        });
        await reconciled;
      };
    } catch (error) {
      stopMaintenance();
      controller.abort();
      await Promise.allSettled(registrations.reverse().map((item) => item.dispose()));
      throw error;
    }
  }
});
export {
  server_default as default,
  refusal,
  toolError,
  verifyContext
};
