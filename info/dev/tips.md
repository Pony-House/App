Como procurar tags

```js
const db = {
  name: 'ShopDB',
  tables: [
    {
      name: 'products',
      columns: {
        id: { primaryKey: true, autoIncrement: true },
        name: { dataType: JsStore.DATA_TYPE.String },
        categories: { dataType: JsStore.DATA_TYPE.Array },
      },
    },
  ],
};

connection
  .select({
    from: 'products',
    where: {
      categories: {
        in: ['eletrônicos'], // Procura registros onde 'eletrônicos' está no array 'categories'
      },
    },
  })
  .then(function (results) {
    console.log(results);
  })
  .catch(function (error) {
    console.error(error);
  });
```

=========================================

https://matrix-org.github.io/matrix-js-sdk/classes/matrix.MatrixClient.html#slidingSync
initMatrix.matrixClient.slidingSync();
/\_matrix/client/v3/sync
/\_matrix/client/unstable/org.matrix.msc3575/sync
