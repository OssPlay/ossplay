export interface OrgStats {
	projects: {
		total: number;
		byVisibility: { public: number; private: number };
	};
	members: { total: number };
	destinations: {
		total: number;
		byStatus: { untested: number; ok: number; error: number };
	};
	storage: {
		totalBytes: number;
		byProject: { projectId: string; name: string; bytes: number }[];
	};
	assets: {
		total: number;
		byStatus: {
			pending: number;
			processing: number;
			ready: number;
			failed: number;
		};
		createdOverTime: { date: string; count: number }[];
	};
}
