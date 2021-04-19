import { CreateParams, DataProvider, GetListParams, HttpError, Identifier } from "ra-core";
import odata from "odata-client";

function get_resource_id(resource: string, id: Identifier)
{
    return (resource !== "groups") ? id : odata.identifier(id)
}

function getresource(apiUrl: string, resource: string, id: Identifier) {
    const o = odata({ service: apiUrl });
    return o.resource(resource, get_resource_id(resource, id));
}

function getfilter(target: string, id: Identifier)
{
    if (target === "GroupId") {
        return odata.identifier(id);
    } else {
        return (id);
    }
}

interface GetRelatedParams extends GetListParams
{
    id?:string
    related?:string
}

interface CreateRelatedParams extends CreateParams
{
    id?:Identifier
    related?:string
}

const ra_data_odata_server = (
    apiUrl: string,
    options: () => Promise<any> = () => Promise.resolve()
): DataProvider => ({
    getList: async (resource, params: GetRelatedParams) => {
        const { page, perPage } = params.pagination;
        const { field, order } = params.sort; // order is either 'DESC' or 'ASC'
        let o = odata({
            service: apiUrl,
        }).count(true);
        if (params.id) {
            o = o.resource(resource, params.id);
        } else {
            o = o.resource(resource);
        }
        if (params.related) {
            o = o.resource(params.related);
        }

        o = o
            .orderby(field, order)
            .skip((page - 1) * perPage)
            .top(perPage);

        for (const filterName in params.filter) {
            o = o.filter(
                `Contains(${filterName},'${params.filter[filterName]}')`
            );
        }

        return o.get(await options()).then((resp: any) => {
            if (resp.statusCode !== 200) {
                return Promise.reject(new HttpError(resp.statusMessage || "getList error", resp.statusCode, resp.body));
            }
            const json = JSON.parse(resp.body);
            if (json.error) {
                return Promise.reject(json.error.message);
            }
            return {
                data: json.value,
                total: json["@odata.count"],
            };
        });
    },

    getOne: async (resource, params) =>
        getresource(apiUrl, resource, params.id)
            .get(await options())
            .then((resp: any) => {
                if (resp.statusCode !== 200) {
                    return Promise.reject(
                        new HttpError(
                            resp.statusMessage || "getOne error",
                            resp.statusCode,
                            resp.body
                        )
                    );
                }
                const json = JSON.parse(resp.body);
                if (json.error) {
                    return Promise.reject(json.error.message);
                }
                return { data: json };
            }),

    getMany: async (resource, params) => {
        const o = await options();
        const results = params.ids.map((id) =>
            getresource(apiUrl, resource, id)
                .get(o)
                .then((resp: any) => {
                    if (resp.statusCode !== 200) {
                        return {
                            id: id,
                            error: new HttpError(
                                resp.statusMessage || "getMany error",
                                resp.statusCode,
                                resp.body
                            ),
                        };
                    }
                    const json = JSON.parse(resp.body);
                    if (json.error) {
                        return {
                            id: id,
                            error: new HttpError(
                                resp.statusMessage || "getMany error",
                                json.error,
                                resp.body
                            ),
                        };
                    }
                    return json;
                })
        );

        const values = await Promise.all(results);
        return { data: values };
    },

    getManyReference: async (resource, params) => {
        const { page, perPage } = params.pagination;
        const { field, order } = params.sort; // order is either 'DESC' or 'ASC'
        if (!params.id) {
            return Promise.resolve({ data: [], total: 0 });
        }
        const o = params.filter.parent
            ? getresource(apiUrl, params.filter.parent, params.id).expand(
                  params.target
              )
            : odata({ service: apiUrl, resources: resource })
                  .count(true)
                  .filter(
                      params.target,
                      "=",
                      getfilter(params.target, params.id)
                  );

        o.count(true)
            .orderby(field, order)
            .skip((page - 1) * perPage)
            .top(perPage);

        return o.get(await options()).then((resp: any) => {
            if (resp.statusCode !== 200) {
                return Promise.reject(resp.body);
            }
            const json = JSON.parse(resp.body);
            if (json.error) {
                return Promise.reject(json.error.message);
            }
            if (params.filter.parent) {
                const d = json[params.target];
                return {
                    data: d,
                    total: d.length,
                };
            } else {
                const d = json.value;
                return {
                    data: d,
                    total: json["@odata.count"],
                };
            }
        });
    },

    update: async (resource, params) =>
        getresource(apiUrl, resource, params.id)
            .patch(params.data, await options())
            .then((resp: any) => {
                if (resp.statusCode !== 200) {
                    return Promise.reject(resp.body);
                }
                const json = JSON.parse(resp.body);
                if (json.error) {
                    return Promise.reject(json.error.message);
                }
                return { data: json };
            }),

    updateMany: (resource, params) =>
        Promise.reject(new Error("not implemented")),

    create: async (resource, params: CreateRelatedParams) => {
        const o =
            params.related && params.id
                ? getresource(apiUrl, resource, params.id).resource(
                      params.related
                  )
                : odata({
                      service: apiUrl,
                  }).resource(resource);

        return o.post(params.data, await options()).then((resp: any) => {
            if (resp.statusCode !== 200) {
                return Promise.reject(resp.body);
            }
            const json = JSON.parse(resp.body);
            if (json.error) {
                return Promise.reject(json.error.message);
            }
            return { data: json };
        });
    },

    delete: async (resource, params) =>
        getresource(apiUrl, resource, params.id)
            .delete(await options())
            .then((resp: any) => {
                if (resp.statusCode !== 200) {
                    return Promise.reject(resp.body);
                }
                const json = JSON.parse(resp.body);
                if (json.error) {
                    return Promise.reject(json.error.message);
                }
                return { data: json };
            }),

    deleteMany: async (resource, params) => {
        const results = params.ids.map((id) =>
            getresource(apiUrl, resource, id)
                .delete()
                .then((resp: any) => {
                    if (resp.statusCode >= 200 && resp.statusCode < 300) {
                        return id;
                    }
                })
        );

        const values = await Promise.all(results);
        return { data: values };
    },
});

export default ra_data_odata_server;